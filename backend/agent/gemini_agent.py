from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from datetime import datetime
from math import ceil
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException, status
from google import genai
from google.genai import errors, types
from supabase import Client

from agent.model_registry import resolve_fallback_chain
from agent.tools import CalendarTools
from config import get_settings
from models.chat import ChatImage


logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Bạn là AI Calendar Agent (Planora) - Trợ lý thông minh chuyên quản lý Lịch học & Nhiệm vụ cho sinh viên Việt Nam.

QUY TẮC CỐT LÕI VỀ HÀNH ĐỘNG & THAO TÁC CƠ SỞ DỮ LIỆU:
1. BẠN LÀ AGENT THỰC THI (ACTION-ORIENTED):
   - Mọi hành động tạo lịch, dời lịch, xóa lịch, lên kế hoạch PHẢI ĐƯỢC THỰC HIỆN BẰNG CÁCH GỌI CÔNG CỤ (TOOL CALLING).
   - TUYỆT ĐỐI KHÔNG ĐƯỢC ẢO GIÁC (NO HALLUCINATIONS): Bạn không được tự nói "Tôi đã tạo thành công...", "Hệ thống đã lưu các sự kiện...", "Bạn hãy mở lịch tuần... xem" NẾU BẠN CHƯA THỰC SỰ GỌI TOOL VÀ NHẬN KẾT QUẢ THÀNH CÔNG TRONG LƯỢT NÀY!
   - Nếu bạn chưa gọi tool, thì sự kiện CHƯA HỀ TỒN TẠI trên lịch của người dùng.

2. XỬ LÝ ẢNH THỜI KHÓA BIỂU & TẠO LỊCH HỌC KỲ:
   - Khi người dùng gửi ảnh thời khóa biểu hoặc yêu cầu "Cập nhật lịch từ ảnh", "Lên lịch theo ảnh này", "Thêm thời khóa biểu này":
     a. Trích xuất thông tin: Tên môn, Thứ trong tuần, Tiết học (giờ bắt đầu - giờ kết thúc), Phòng học, và Ngày bắt đầu - Ngày kết thúc của học kỳ trong ảnh.
     b. Nếu ngày bắt đầu/kết thúc hoặc thông tin đã rõ ràng: HÃY GỌI NGAY công cụ `create_calendar_events` với danh sách toàn bộ các môn học được trích xuất (kèm `recurrence_rule="weekly"`, `recurrence_end="YYYY-MM-DD"` tương ứng với học kỳ).
     c. Nếu người dùng xác nhận "hãy cập nhật dựa trên ảnh": BẮT BUỘC PHẢI GỌI `create_calendar_events` ngay trong lượt đó, KHÔNG ĐƯỢC chỉ trả lời văn bản mà không gọi tool!

3. THỜI GIAN & MÚI GIỜ:
   - Luôn sử dụng định dạng ISO 8601 có múi giờ (VD: `2026-09-28T07:30:00+07:00`) cho `start_time` và `end_time`.
   - Với các môn học theo tiết ở đại học Việt Nam (nếu không ghi rõ giờ): Tiết 1-4 (07:30 - 11:00), Tiết 6-9 (12:40 - 16:10), v.v.
   - Ngày giờ hiện tại: {now}. Múi giờ của người dùng: {timezone}.
   - KHÔNG cần gọi `get_current_schedule` trước khi tạo lịch mới — hệ thống sẽ tự bỏ qua các sự kiện bị trùng.

4. ĐỌC & XỬ LÝ KẾT QUẢ TOOL:
   - Nếu tool `create_calendar_events` trả về kết quả có `created_count > 0`: Thông báo thành công với số sự kiện đã tạo.
   - Nếu kết quả có thêm trường `skipped_conflicts`: Thông báo rằng một số sự kiện bị bỏ qua vì trùng với lịch đã có, và liệt kê tên chúng.
   - Nếu tool trả về trường `error`: PHẢI thông báo lỗi đó rõ ràng cho người dùng, KHÔNG ĐƯỢC nói "đã tạo thành công".
   - Luôn báo kết quả thực tế từ tool cho người dùng, không được tự suy diễn thêm.

5. TRẢ LỜI NGƯỜI DÙNG:
   - Trả lời bằng tiếng Việt thân thiện, rõ ràng, ngắn gọn.
   - Chỉ báo cho người dùng biết lịch đã được tạo SAU KHI tool `create_calendar_events` hoặc `create_calendar_event` đã thực thi thành công.
   - Khi công cụ lập lịch trả complete=false, phải nói rõ số phút đã xếp và số phút còn thiếu.
"""

MAX_HISTORY_CHARACTERS = 24_000
MAX_TOOL_ROUNDS = 8


class CalendarAgentSession:
    requested_model: str = "auto"
    model_used: str = "gemini-3.5-flash-lite"
    model_name: str = "Gemini 3.5 Flash Lite"

    def __init__(
        self,
        user_id: UUID,
        supabase: Client,
        history: list[dict] | None = None,
        requested_model: str | None = "auto",
    ):
        settings = get_settings()
        if not settings.gemini_configured:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Gemini chưa được cấu hình. Hãy bổ sung GEMINI_API_KEY trong backend/.env.",
            )
        self.settings = settings
        self.requested_model = requested_model or settings.gemini_model or "auto"
        self.tools = CalendarTools(supabase, user_id, settings.default_timezone)
        self.client = genai.Client(
            api_key=settings.gemini_api_key,
            http_options=types.HttpOptions(timeout=20000),
        )
        self.contents = _history_contents(history or [])
        self.model_used: str = "gemini-3.5-flash-lite"
        self.model_name: str = "Gemini 3.5 Flash Lite"

    @property
    def actions(self) -> list[dict]:
        return self.tools.actions

    def _config(self) -> types.GenerateContentConfig:
        timezone = self.tools.timezone
        return types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT.format(
                now=datetime.now(ZoneInfo(timezone)).isoformat(), timezone=timezone
            ),
            tools=self.tools.available_tools(),
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            temperature=0.2,
        )

    def run(self, prompt: str, images: list[ChatImage] | None = None) -> str:
        chain = resolve_fallback_chain(
            self.requested_model,
            has_images=bool(images),
            has_groq_key=getattr(self.settings, "groq_configured", False),
        )
        last_exc: Exception | None = None

        for idx, model_desc in enumerate(chain):
            target_model = model_desc.id
            contents = [*self.contents, _user_content(prompt, images or [])]
            try:
                logger.info("Chạy model %s (%s) [Bậc: %s, Điểm: %s/10]", target_model, model_desc.name, model_desc.tier_label, model_desc.intelligence_score)
                for _ in range(MAX_TOOL_ROUNDS):
                    response = self.client.models.generate_content(
                        model=target_model,
                        contents=contents,
                        config=self._config(),
                    )
                    calls = response.function_calls or []
                    if calls:
                        _append_tool_round(
                            contents,
                            response,
                            [self.tools.execute_tool(call.name or "", dict(call.args or {})) for call in calls],
                        )
                        continue
                    text = _response_text(response)
                    if text:
                        self.model_used = model_desc.id
                        self.model_name = model_desc.name
                        return text
                    raise _empty_response_error(response)
                raise HTTPException(
                    status_code=502,
                    detail="Trợ lý đã gọi quá nhiều bước công cụ mà chưa hoàn tất. Vui lòng chia yêu cầu thành phần nhỏ hơn.",
                )
            except Exception as exc:
                last_exc = exc
                if _is_rate_limit_or_overloaded(exc) and idx < len(chain) - 1:
                    next_model = chain[idx + 1]
                    logger.warning(
                        "Model %s gặp giới hạn hoặc quá tải. Tự động chuyển tiếp (Cascading) sang model: %s (%s)",
                        target_model,
                        next_model.id,
                        next_model.name,
                    )
                    continue
                raise _agent_error(exc) from exc

        if last_exc:
            raise _agent_error(last_exc) from last_exc
        raise HTTPException(status_code=503, detail="Không thể kết nối đến các mô hình AI lúc này.")

    async def stream(self, prompt: str, images: list[ChatImage] | None = None) -> AsyncIterator[str]:
        chain = resolve_fallback_chain(
            self.requested_model,
            has_images=bool(images),
            has_groq_key=getattr(self.settings, "groq_configured", False),
        )
        last_exc: Exception | None = None

        for idx, model_desc in enumerate(chain):
            target_model = model_desc.id
            contents = [*self.contents, _user_content(prompt, images or [])]
            try:
                logger.info("Stream model %s (%s) [Bậc: %s, Điểm: %s/10]", target_model, model_desc.name, model_desc.tier_label, model_desc.intelligence_score)
                for round_idx in range(MAX_TOOL_ROUNDS):
                    response = await self.client.aio.models.generate_content(
                        model=target_model,
                        contents=contents,
                        config=self._config(),
                    )
                    calls = response.function_calls or []
                    if calls:
                        call_names = [c.name for c in calls]
                        logger.info("[Round %d] Model gọi %d tool(s): %s", round_idx + 1, len(calls), call_names)
                        results = []
                        for call in calls:
                            result = await asyncio.to_thread(
                                self.tools.execute_tool,
                                call.name or "",
                                dict(call.args or {}),
                            )
                            if "error" in result:
                                logger.warning("[Tool %s] Trả về lỗi: %s", call.name, result["error"])
                            else:
                                logger.info("[Tool %s] Thành công: %s", call.name, {k: v for k, v in result.items() if k != "events"})
                            results.append(result)
                        _append_tool_round(contents, response, results)
                        continue
                    text = _response_text(response)
                    if not text:
                        raise _empty_response_error(response)
                    logger.info("[Round %d] Model KHÔNG gọi tool — trả về text (%d ký tự). Tool history: %s", round_idx + 1, len(text), [c.name for c in (response.function_calls or [])])
                    self.model_used = model_desc.id
                    self.model_name = model_desc.name
                    yield text
                    return
                raise HTTPException(
                    status_code=502,
                    detail="Trợ lý đã gọi quá nhiều bước công cụ mà chưa hoàn tất. Vui lòng chia yêu cầu thành phần nhỏ hơn.",
                )
            except Exception as exc:
                last_exc = exc
                if _is_rate_limit_or_overloaded(exc) and idx < len(chain) - 1:
                    next_model = chain[idx + 1]
                    logger.warning(
                        "Model %s gặp giới hạn. Tự động chuyển tiếp (Cascading) sang: %s (%s)",
                        target_model,
                        next_model.id,
                        next_model.name,
                    )
                    continue
                raise _agent_error(exc) from exc

        if last_exc:
            raise _agent_error(last_exc) from last_exc
        raise HTTPException(status_code=503, detail="Không thể kết nối đến các mô hình AI lúc này.")


def run_calendar_agent(
    prompt: str,
    user_id: UUID,
    supabase: Client,
    history: list[dict] | None = None,
    images: list[ChatImage] | None = None,
    model: str | None = "auto",
) -> tuple[str, list[dict], str]:
    session = CalendarAgentSession(user_id, supabase, history, requested_model=model)
    return session.run(prompt, images), session.actions, session.model_used


def generate_conversation_title(message: str) -> str:
    settings = get_settings()
    if not settings.gemini_configured:
        return fallback_conversation_title(message)
    try:
        client = genai.Client(
            api_key=settings.gemini_api_key,
            http_options=types.HttpOptions(timeout=5000),
        )
        response = client.models.generate_content(
            model="gemini-3.5-flash-lite",
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


def _append_tool_round(
    contents: list[types.Content],
    response: types.GenerateContentResponse,
    results: list[dict],
) -> None:
    calls = response.function_calls or []
    model_content = (
        response.candidates[0].content
        if response.candidates and response.candidates[0].content
        else None
    )
    if model_content is None or len(calls) != len(results):
        raise HTTPException(status_code=502, detail="Gemini trả về lời gọi công cụ không hoàn chỉnh.")
    contents.append(model_content)
    response_parts: list[types.Part] = []
    for call, result in zip(calls, results, strict=True):
        response_parts.append(types.Part(function_response=types.FunctionResponse(
            id=call.id,
            name=call.name or "unknown_tool",
            response=result,
        )))
    contents.append(types.Content(role="user", parts=response_parts))


def _response_text(response: types.GenerateContentResponse) -> str:
    if not response.candidates or not response.candidates[0].content:
        return ""
    return "".join(
        part.text
        for part in (response.candidates[0].content.parts or [])
        if part.text and not getattr(part, "thought", False)
    ).strip()


def _empty_response_error(response: types.GenerateContentResponse) -> HTTPException:
    block_reason = getattr(getattr(response, "prompt_feedback", None), "block_reason", None)
    if block_reason:
        return HTTPException(
            status_code=422,
            detail="Gemini đã từ chối nội dung này theo chính sách an toàn. Hãy dùng ảnh và yêu cầu khác.",
        )
    return HTTPException(
        status_code=502,
        detail="Gemini trả về phản hồi rỗng. Không có thay đổi nào được xác nhận.",
    )


def fallback_conversation_title(message: str) -> str:
    clean = " ".join(message.split())
    if len(clean) <= 52:
        return clean or "Đoạn chat mới"
    shortened = clean[:53].rsplit(" ", 1)[0].rstrip(".,;:!?-–—")
    return shortened or clean[:52]


def _is_rate_limit_or_overloaded(exc: Exception) -> bool:
    if isinstance(exc, HTTPException):
        if "phản hồi rỗng" in str(exc.detail or ""):
            return False
        return exc.status_code in {404, 429, 500, 503, 504}
    if isinstance(exc, errors.ClientError):
        code = getattr(exc, "code", None)
        if code in {400, 404, 429}:
            return True
    if isinstance(exc, (errors.ServerError, httpx.TimeoutException, httpx.NetworkError)):
        return True
    msg = str(exc).lower()
    return any(
        k in msg
        for k in [
            "429",
            "404",
            "not_found",
            "not found",
            "resource_exhausted",
            "quota",
            "rate limit",
            "503",
            "500",
            "service unavailable",
            "overloaded",
            "no longer available",
            "is not found",
            "deprecated",
        ]
    )


def _quota_retry_after(exc: errors.ClientError) -> str | None:
    details = getattr(exc, "details", None)
    if not isinstance(details, dict):
        return None
    error = details.get("error")
    if not isinstance(error, dict):
        return None
    for item in error.get("details") or []:
        if isinstance(item, dict) and str(item.get("@type", "")).endswith("RetryInfo"):
            delay = str(item.get("retryDelay", "")).strip().removesuffix("s")
            if delay.replace(".", "", 1).isdigit():
                return str(max(1, ceil(float(delay))))
    return None


def _quota_error(exc: errors.ClientError) -> HTTPException:
    raw = f"{getattr(exc, 'message', '')} {getattr(exc, 'details', '')}".lower()
    is_daily = any(marker in raw for marker in (
        "generaterequestsperdayperprojectpermodel",
        "free_tier_requests",
        "per day",
        "perday",
    ))
    if is_daily:
        return HTTPException(
            status_code=429,
            detail=(
                "Đã hết hạn mức Gemini miễn phí trong ngày cho tất cả model. "
                "Hãy thử lại sau khi hạn mức được làm mới."
            ),
            headers={"X-Planora-Error-Code": "gemini_daily_quota"},
        )
    headers = {"X-Planora-Error-Code": "gemini_rate_limit"}
    retry_after = _quota_retry_after(exc)
    if retry_after:
        headers["Retry-After"] = retry_after
    return HTTPException(
        status_code=429,
        detail="Hệ thống AI đang giới hạn tốc độ. Vui lòng chờ một lúc rồi thử lại.",
        headers=headers,
    )


def _agent_error(exc: Exception) -> HTTPException:
    if isinstance(exc, HTTPException):
        return exc
    if isinstance(exc, errors.ClientError):
        code = getattr(exc, "code", None)
        if code == 429:
            classified = _quota_error(exc)
            logger.warning(
                "Gemini request rejected code=429 category=%s",
                classified.headers.get("X-Planora-Error-Code") if classified.headers else "rate_limit",
            )
            return classified
        if code in {400, 403}:
            logger.warning("Gemini request rejected code=%s", code)
            return HTTPException(status_code=422, detail="Mô hình AI không thể xử lý yêu cầu này. Hãy diễn đạt lại nội dung.")
    if isinstance(exc, (errors.ServerError, httpx.TimeoutException, httpx.NetworkError)):
        logger.warning("AI upstream unavailable type=%s", type(exc).__name__)
        return HTTPException(status_code=503, detail="Tạm thời không kết nối được với hệ thống AI. Vui lòng thử lại.")
    logger.exception("Calendar Agent thất bại")
    return HTTPException(status_code=502, detail="Trợ lý AI gặp lỗi khi xử lý yêu cầu.")
