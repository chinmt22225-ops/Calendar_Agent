from datetime import datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from google import genai
from google.genai import types
from supabase import Client

from agent.tools import CalendarTools
from config import get_settings


SYSTEM_PROMPT = """Bạn là AI Calendar Agent dành cho sinh viên Việt Nam.
Bạn giúp người dùng lập kế hoạch học, tìm giờ trống, tạo, dời và xóa sự kiện.
Luôn kiểm tra lịch hiện tại trước khi tạo hoặc dời sự kiện để tránh trùng giờ.
Nếu yêu cầu thiếu ngày, giờ, múi giờ hoặc thời lượng quan trọng, hãy hỏi lại thay vì tự đoán.
Chỉ thực hiện thay đổi lịch mà người dùng yêu cầu rõ ràng. Trả lời ngắn gọn, thân thiện bằng tiếng Việt.
Ngày giờ hiện tại: {now}. Múi giờ của người dùng: {timezone}.
"""


def run_calendar_agent(
    prompt: str,
    user_id: UUID,
    supabase: Client,
    history: list[dict] | None = None,
) -> tuple[str, list[dict]]:
    settings = get_settings()
    if not settings.gemini_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini chưa được cấu hình. Hãy bổ sung GEMINI_API_KEY trong backend/.env.",
        )

    timezone = settings.default_timezone
    tools = CalendarTools(supabase, user_id, timezone)
    client = genai.Client(api_key=settings.gemini_api_key)
    context = ""
    if history:
        recent = history[-12:]
        context = "\n".join(f"{item['role']}: {item['content']}" for item in recent)

    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=f"Lịch sử gần đây:\n{context}\n\nYêu cầu mới: {prompt}",
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT.format(
                now=datetime.now(ZoneInfo(timezone)).isoformat(), timezone=timezone
            ),
            tools=[
                tools.get_current_schedule,
                tools.create_calendar_events,
                tools.create_calendar_event,
                tools.reschedule_event,
                tools.delete_calendar_event,
                tools.find_free_time_slots,
                tools.auto_plan_study_sessions,
            ],
            temperature=0.2,
        ),
    )
    return response.text or "Mình đã xử lý yêu cầu của bạn.", tools.actions
