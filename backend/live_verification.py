"""Opt-in live smoke test for the linked Supabase project and running API."""

from __future__ import annotations

import json
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import httpx
from supabase import create_client

from config import get_settings


def verify() -> None:
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

        with httpx.Client(base_url="http://127.0.0.1:8000/api", headers=headers, timeout=90) as api:
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
            assert api.delete(f"/tasks/{task_id}").status_code == 204

            conversation_id = None
            stream_ok = False
            one_pixel_png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
            with api.stream("POST", "/chat/stream", json={
                "message": "Hãy xác nhận ngắn gọn rằng bạn đã nhận được ảnh.",
                "conversation_id": None,
                "images": [{"mime_type": "image/png", "data": one_pixel_png}],
            }) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line.startswith("data: "):
                        continue
                    payload = json.loads(line[6:])
                    if payload["type"] == "start":
                        conversation_id = payload["conversation_id"]
                    if payload["type"] == "error":
                        raise AssertionError(payload["detail"])
                    if payload["type"] == "done":
                        stream_ok = True
            assert stream_ok and conversation_id
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
    verify()
    print("Live API verification: OK")
