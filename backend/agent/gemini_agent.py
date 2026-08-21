from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from datetime import datetime
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException, status
from google import genai
from google.genai import errors, types
from supabase import Client

from agent.tools import CalendarTools
from config import get_settings
from models.chat import ChatImage


logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Bạn là AI Calendar Agent dành cho sinh viên Việt Nam.
Bạn giúp người dùng lập kế hoạch học, tìm giờ trống, tạo, dời và xóa sự kiện.
Luôn kiểm tra lịch hiện tại trước khi tạo hoặc dời sự kiện để tránh trùng giờ.
Nếu yêu cầu thiếu ngày, giờ, múi giờ hoặc thời lượng quan trọng, hãy hỏi lại thay vì tự đoán.
Chỉ thực hiện thay đổi lịch mà người dùng yêu cầu rõ ràng. Trả lời ngắn gọn, thân thiện bằng tiếng Việt.
Khi công cụ lập lịch trả complete=false, phải nói rõ số phút đã xếp và số phút còn thiếu; không được tuyên bố kế hoạch đã hoàn tất.
Ngày giờ hiện tại: {now}. Múi giờ của người dùng: {timezone}.
"""

MAX_HISTORY_CHARACTERS = 48_000


class CalendarAgentSession:
    def __init__(self, user_id: UUID, supabase: Client, history: list[dict] | None = None):
        settings = get_settings()
        if not settings.gemini_configured:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Gemini chưa được cấu hình. Hãy bổ sung GEMINI_API_KEY trong backend/.env.",
            )
        self.settings = settings
        self.tools = CalendarTools(supabase, user_id, settings.default_timezone)
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.contents = _history_contents(history or [])

    @property
    def actions(self) -> list[dict]:
        return self.tools.actions

    def _config(self) -> types.GenerateContentConfig:
        timezone = self.tools.timezone
        return types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT.format(
                now=datetime.now(ZoneInfo(timezone)).isoformat(), timezone=timezone
            ),
            tools=[
                self.tools.get_current_schedule,
                self.tools.create_calendar_events,
                self.tools.create_calendar_event,
                self.tools.reschedule_event,
                self.tools.delete_calendar_event,
                self.tools.find_free_time_slots,
                self.tools.auto_plan_study_sessions,
            ],
            temperature=0.2,
        )

    def run(self, prompt: str, images: list[ChatImage] | None = None) -> str:
        contents = [*self.contents, _user_content(prompt, images or [])]
        try:
            response = self.client.models.generate_content(
                model=self.settings.gemini_model,
                contents=contents,
                config=self._config(),
            )
            return response.text or "Mình đã xử lý yêu cầu của bạn."
        except Exception as exc:
            raise _agent_error(exc) from exc

    async def stream(self, prompt: str, images: list[ChatImage] | None = None) -> AsyncIterator[str]:
        contents = [*self.contents, _user_content(prompt, images or [])]
        try:
            stream = await self.client.aio.models.generate_content_stream(
                model=self.settings.gemini_model,
                contents=contents,
                config=self._config(),
            )
            async for chunk in stream:
                if chunk.text:
                    yield chunk.text
        except Exception as exc:
            raise _agent_error(exc) from exc


def run_calendar_agent(
    prompt: str,
    user_id: UUID,
    supabase: Client,
    history: list[dict] | None = None,
    images: list[ChatImage] | None = None,
) -> tuple[str, list[dict]]:
    session = CalendarAgentSession(user_id, supabase, history)
    return session.run(prompt, images), session.actions


def generate_conversation_title(message: str) -> str:
    settings = get_settings()
    if not settings.gemini_configured:
        return fallback_conversation_title(message)
    try:
        client = genai.Client(api_key=settings.gemini_api_key)
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=(
                "Đặt tiêu đề tiếng Việt 5-7 từ cho yêu cầu lịch sau. "
                "Chỉ trả về tiêu đề, không dấu ngoặc kép:\n" + message
            ),
            config=types.GenerateContentConfig(temperature=0.1, max_output_tokens=40),
        )
        clean = " ".join((response.text or "").strip().strip('"').split())
        return clean[:100] or fallback_conversation_title(message)
    except Exception:
        logger.warning("Không thể tạo tiêu đề hội thoại bằng Gemini", exc_info=True)
        return fallback_conversation_title(message)


def _history_contents(history: list[dict]) -> list[types.Content]:
    selected: list[dict] = []
    used_characters = 0
    for item in reversed(history):
        content = item.get("content")
        if item.get("role") not in {"user", "assistant"} or not content:
            continue
        remaining = MAX_HISTORY_CHARACTERS - used_characters
        if remaining <= 0:
            break
        if len(content) > remaining:
            content = content[-remaining:]
        selected.append({**item, "content": content})
        used_characters += len(content)
    contents: list[types.Content] = []
    for item in reversed(selected):
        role = "model" if item.get("role") == "assistant" else "user"
        contents.append(types.Content(role=role, parts=[types.Part(text=item["content"])]))
    return contents


def _user_content(prompt: str, images: list[ChatImage]) -> types.Content:
    parts: list[types.Part] = []
    clean_prompt = prompt.strip()
    if clean_prompt:
        parts.append(types.Part(text=clean_prompt))
    else:
        parts.append(types.Part(text="Hãy phân tích ảnh đính kèm và hỗ trợ theo ngữ cảnh lịch học."))
    parts.extend(
        types.Part.from_bytes(data=image.as_bytes(), mime_type=image.mime_type)
        for image in images
    )
    return types.Content(role="user", parts=parts)


def fallback_conversation_title(message: str) -> str:
    clean = " ".join(message.split())
    return clean[:52] or "Đoạn chat mới"


def _agent_error(exc: Exception) -> HTTPException:
    logger.exception("Gemini Calendar Agent thất bại", exc_info=exc)
    if isinstance(exc, errors.ClientError):
        code = getattr(exc, "code", None)
        if code == 429:
            return HTTPException(status_code=429, detail="Gemini đang quá tải hoặc đã hết hạn mức. Vui lòng thử lại sau.")
        if code in {400, 403}:
            return HTTPException(status_code=422, detail="Gemini không thể xử lý yêu cầu này. Hãy diễn đạt lại nội dung.")
    if isinstance(exc, (errors.ServerError, httpx.TimeoutException, httpx.NetworkError)):
        return HTTPException(status_code=503, detail="Tạm thời không kết nối được với Gemini. Vui lòng thử lại.")
    if isinstance(exc, HTTPException):
        return exc
    return HTTPException(status_code=502, detail="Trợ lý AI gặp lỗi khi xử lý yêu cầu.")
