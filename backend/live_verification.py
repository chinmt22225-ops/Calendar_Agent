"""Opt-in live smoke test for the linked Supabase project and running API."""

from __future__ import annotations

import argparse
import base64
import json
import secrets
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

import httpx
from supabase import create_client

from config import get_settings


def verify(schedule_image: Path | None = None, ai_pause_seconds: float = 65) -> None:
    settings = get_settings()
    admin = create_client(settings.supabase_url, settings.supabase_service_role_key)
    public = create_client(settings.supabase_url, settings.supabase_publishable_key)
    email = f"planora-smoke-{secrets.token_hex(5)}@example.com"
    password = f"Smoke-{secrets.token_urlsafe(18)}!"
    user_id: str | None = None
    try:
        created = admin.auth.admin.create_user({"email": email, "password": password, "email_confirm": True})
        user_id = str(created.user.id)
        session = public.auth.sign_in_with_password({"email": email, "password": password}).session
        assert session
        headers = {"Authorization": f"Bearer {session.access_token}"}
        rate_limit_probe = admin.rpc("consume_api_rate_limit", {
            "p_user_id": user_id,
            "p_bucket": "smoke_probe",
            "p_limit": 2,
            "p_window_seconds": 60,
        }).execute().data
        assert rate_limit_probe["allowed"] is True
        start_day = date.today() + timedelta(days=30)
        start = f"{start_day.isoformat()}T08:00:00+07:00"
        end = f"{start_day.isoformat()}T09:00:00+07:00"
        repeat_end = (start_day + timedelta(days=2)).isoformat()

        with httpx.Client(base_url="http://127.0.0.1:8000/api", headers=headers, timeout=180) as api:
            last_ai_started = 0.0

            def ask_ai(message: str, images: list[dict] | None = None) -> dict:
                nonlocal last_ai_started
                remaining_pause = ai_pause_seconds - (time.monotonic() - last_ai_started)
                if last_ai_started and remaining_pause > 0:
                    time.sleep(remaining_pause)
                last_ai_started = time.monotonic()
                result = {"conversation_id": None, "text": "", "actions": [], "done": False}
                with api.stream("POST", "/chat/stream", json={
                    "message": message,
                    "conversation_id": None,
                    "images": images or [],
                }) as response:
                    response.raise_for_status()
                    for line in response.iter_lines():
                        if not line.startswith("data: "):
                            continue
                        payload = json.loads(line[6:])
                        if payload["type"] == "start":
                            result["conversation_id"] = payload["conversation_id"]
                        elif payload["type"] == "token":
                            result["text"] += payload["content"]
                        elif payload["type"] == "actions":
                            result["actions"] = payload["actions"]
                        elif payload["type"] == "error":
                            raise AssertionError(payload["detail"])
                        elif payload["type"] == "done":
                            result["done"] = True
                assert result["done"] and result["conversation_id"]
                assert result["text"].strip()
                assert result["text"].strip() != "Mình đã xử lý yêu cầu của bạn."
                return result

            profile = api.get("/profile"); profile.raise_for_status()
            assert profile.json()["timezone"] == "Asia/Ho_Chi_Minh"
            updated_profile = api.patch("/profile", json={"day_start": "08:00", "day_end": "21:30", "pomodoro_minutes": 45})
            updated_profile.raise_for_status()

            event = api.post("/events", json={
                "title": "Kiểm thử recurrence", "description": "Dữ liệu tạm tự động xóa",
                "start_time": start, "end_time": end, "color": "#2563eb", "category": "Smoke test",
                "status": "scheduled", "is_ai_generated": False, "all_day": False,
                "recurrence_rule": "daily", "recurrence_end": repeat_end,
            })
            event.raise_for_status(); event_id = event.json()["id"]

            conflict_day = start_day + timedelta(days=1)
            conflict = api.post("/events", json={
                "title": "Phải bị chặn", "start_time": f"{conflict_day.isoformat()}T08:30:00+07:00",
                "end_time": f"{conflict_day.isoformat()}T09:30:00+07:00", "color": "#db2777",
                "category": "Smoke test", "status": "scheduled", "is_ai_generated": False,
                "all_day": False, "recurrence_rule": None, "recurrence_end": None,
            })
            assert conflict.status_code == 409

            assert api.delete(f"/events/{event_id}").status_code == 204
            assert any(item["id"] == event_id for item in api.get("/events/trash").json())
            restored = api.post(f"/events/{event_id}/restore"); restored.raise_for_status()
            completed = api.patch(f"/events/{event_id}", json={"status": "completed"}); completed.raise_for_status()
            assert api.delete(f"/events/{event_id}").status_code == 204
            assert api.delete(f"/events/{event_id}/permanent").status_code == 204

            atomic_start = start_day + timedelta(days=7)
            atomic_payloads = [
                {
                    "title": "Atomic recurrence A",
                    "start_time": f"{atomic_start.isoformat()}T08:00:00+07:00",
                    "end_time": f"{atomic_start.isoformat()}T09:00:00+07:00",
                    "color": "#3b55b2", "category": "Smoke test",
                    "status": "scheduled", "is_ai_generated": False,
                    "all_day": False, "recurrence_rule": "weekly",
                    "recurrence_end": (atomic_start + timedelta(days=14)).isoformat(),
                },
                {
                    "title": "Atomic recurrence B",
                    "start_time": f"{(atomic_start + timedelta(days=7)).isoformat()}T08:30:00+07:00",
                    "end_time": f"{(atomic_start + timedelta(days=7)).isoformat()}T09:30:00+07:00",
                    "color": "#5f548a", "category": "Smoke test",
                    "status": "scheduled", "is_ai_generated": False,
                    "all_day": False, "recurrence_rule": "weekly",
                    "recurrence_end": (atomic_start + timedelta(days=21)).isoformat(),
                },
            ]
            def create_atomic(payload):
                return httpx.post(
                    "http://127.0.0.1:8000/api/events",
                    headers=headers, json=payload, timeout=30,
                )
            with ThreadPoolExecutor(max_workers=2) as pool:
                atomic_responses = list(pool.map(create_atomic, atomic_payloads))
            assert sorted(response.status_code for response in atomic_responses) == [201, 409]

            task = api.post("/tasks", json={
                "title": "Task smoke test", "subject": "QA", "estimated_hours": 1,
                "deadline": start_day.isoformat(), "priority": 2, "status": "pending",
            })
            task.raise_for_status(); task_id = task.json()["id"]
            assert api.patch(f"/tasks/{task_id}", json={"status": "completed"}).status_code == 200

            one_pixel_png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
            image_and_read = ask_ai(
                f"Hãy dùng công cụ kiểm tra lịch ngày {start_day.isoformat()}, sau đó xác nhận ngắn gọn rằng bạn đã nhận ảnh. Không tạo, sửa hoặc xóa dữ liệu.",
                [{"mime_type": "image/png", "data": one_pixel_png}],
            )

            task_answer = ask_ai(
                f"Hãy tìm tất cả nhiệm vụ có deadline đúng ngày {start_day.isoformat()} và cho biết tên, môn học, trạng thái."
            )
            assert "Task smoke test" in task_answer["text"]

            ai_day = start_day + timedelta(days=18)
            ai_title = f"AI tool smoke {secrets.token_hex(3)}"
            created_by_text = ask_ai(
                f"Hãy tạo đúng một sự kiện tên '{ai_title}' vào ngày {ai_day.isoformat()} từ 10:00 đến 11:00 theo múi giờ Asia/Ho_Chi_Minh, danh mục Smoke test, không lặp lại."
            )
            assert any(action["type"] == "created" for action in created_by_text["actions"])
            listed = api.get("/events", params={
                "start": f"{ai_day.isoformat()}T00:00:00+07:00",
                "end": f"{(ai_day + timedelta(days=1)).isoformat()}T00:00:00+07:00",
            })
            listed.raise_for_status()
            assert any(item["title"] == ai_title for item in listed.json())

            if schedule_image:
                schedule_payload = base64.b64encode(schedule_image.read_bytes()).decode()
                schedule_result = ask_ai(
                    "Hãy GỘP thời khóa biểu trong ảnh vào lịch. Đây là đúng một tuần từ 2026-08-16 đến 2026-08-22, không lặp lại. Tạo các khối môn học có giờ bắt đầu/kết thúc; bỏ qua hai banner #AIRiserVietnam và Ngày làm việc. Không xóa sự kiện khác.",
                    [{"mime_type": "image/png", "data": schedule_payload}],
                )
                assert any(action["type"] == "created" for action in schedule_result["actions"])
                schedule_events = api.get("/events", params={
                    "start": "2026-08-16T00:00:00+07:00",
                    "end": "2026-08-23T00:00:00+07:00",
                })
                schedule_events.raise_for_status()
                assert len(schedule_events.json()) >= 9

            assert api.delete(f"/tasks/{task_id}").status_code == 204
            conversation_id = image_and_read["conversation_id"]
            conversations = api.get("/chat/conversations"); conversations.raise_for_status()
            assert any(item["id"] == conversation_id for item in conversations.json())
            messages = api.get(f"/chat/conversations/{conversation_id}"); messages.raise_for_status()
            assert messages.json()[0]["metadata"]["image_count"] == 1
            assert api.patch(f"/chat/conversations/{conversation_id}", json={"title": "Đã đổi tên"}).status_code == 200
            assert api.delete(f"/chat/conversations/{conversation_id}").status_code == 204
    finally:
        if user_id:
            admin.auth.admin.delete_user(user_id)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--schedule-image", type=Path)
    parser.add_argument("--ai-pause-seconds", type=float, default=65)
    arguments = parser.parse_args()
    verify(arguments.schedule_image, arguments.ai_pause_seconds)
    print("Live API verification: OK")
