from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field
from supabase import Client

from agent.scheduler_logic import distribute_study_sessions, find_free_slots


class ToolEvent(BaseModel):
    title: str
    start_time: str
    end_time: str
    description: str = ""
    category: str = "Học tập"
    color: str = Field(default="#2563eb", pattern=r"^#[0-9a-fA-F]{6}$")


class CalendarTools:
    def __init__(self, client: Client, user_id: UUID, timezone: str):
        self.client = client
        self.user_id = str(user_id)
        self.timezone = timezone
        self.actions: list[dict] = []

    def get_current_schedule(self, start_date: str, end_date: str) -> dict:
        """Get the user's events between two ISO date or datetime values.

        Args:
            start_date: Inclusive ISO start date or datetime.
            end_date: Inclusive ISO end date or datetime.
        """
        events = self._get_events(start_date, end_date)
        return {"count": len(events), "events": events}

    def create_calendar_event(
        self,
        title: str,
        start_time: str,
        end_time: str,
        description: str = "",
        category: str = "Học tập",
        color: str = "#2563eb",
    ) -> dict:
        """Create one calendar event for the signed-in user.

        Args:
            title: Concise event title.
            start_time: ISO datetime including timezone.
            end_time: ISO datetime including timezone and later than start_time.
            description: Optional notes.
            category: Subject or event group.
            color: Six-digit hexadecimal color.
        """
        result = self.create_calendar_events([
            ToolEvent(
                title=title, start_time=start_time, end_time=end_time,
                description=description, category=category, color=color,
            )
        ])
        if "error" in result:
            return result
        return result["events"][0]

    def create_calendar_events(self, events: list[ToolEvent]) -> dict:
        """Create one or more non-overlapping calendar events.

        Args:
            events: Events with title, ISO start/end time, description, category and color.
        """
        if not events:
            return {"error": "Danh sách sự kiện đang trống."}
        payloads = []
        for event in events:
            if datetime.fromisoformat(event.end_time.replace("Z", "+00:00")) <= datetime.fromisoformat(event.start_time.replace("Z", "+00:00")):
                return {"error": f"Thời gian của '{event.title}' không hợp lệ."}
            if self._has_conflict(event.start_time, event.end_time):
                return {"error": f"'{event.title}' đang trùng với một sự kiện khác. Hãy tìm khung giờ khác."}
            payloads.append({
            "user_id": self.user_id,
            **event.model_dump(),
            "status": "scheduled",
            "is_ai_generated": True,
            })
        created = self.client.table("events").insert(payloads).execute().data
        ids = [row["id"] for row in created]
        label = f"Đã thêm {len(created)} sự kiện vào lịch" if len(created) > 1 else f"Đã thêm {created[0]['title']} vào lịch"
        self.actions.append(
            {"type": "created", "label": label, "event_ids": ids}
        )
        return {"created_count": len(created), "events": created}

    def reschedule_event(self, event_id: str, new_start: str, new_end: str) -> dict:
        """Move an existing event to a new ISO time range.

        Args:
            event_id: Existing event UUID.
            new_start: New ISO start datetime with timezone.
            new_end: New ISO end datetime with timezone.
        """
        if self._has_conflict(new_start, new_end, exclude_id=event_id):
            return {"error": "Khung giờ mới đang trùng với một sự kiện khác."}
        rows = (
            self.client.table("events")
            .update({"start_time": new_start, "end_time": new_end})
            .eq("id", event_id)
            .eq("user_id", self.user_id)
            .execute()
            .data
        )
        if not rows:
            return {"error": "Không tìm thấy sự kiện."}
        self.actions.append(
            {"type": "updated", "label": f"Đã dời {rows[0]['title']}", "event_ids": [event_id]}
        )
        return rows[0]

    def delete_calendar_event(self, event_id: str) -> dict:
        """Delete one calendar event by UUID.

        Args:
            event_id: Existing event UUID.
        """
        rows = (
            self.client.table("events")
            .delete()
            .eq("id", event_id)
            .eq("user_id", self.user_id)
            .execute()
            .data
        )
        if not rows:
            return {"error": "Không tìm thấy sự kiện."}
        self.actions.append(
            {"type": "deleted", "label": f"Đã xóa {rows[0]['title']}", "event_ids": [event_id]}
        )
        return {"deleted": True, "event": rows[0]}

    def find_free_time_slots(self, target_date: str, duration_minutes: int) -> dict:
        """Find available study slots on a date.

        Args:
            target_date: Date in YYYY-MM-DD format.
            duration_minutes: Required uninterrupted duration in minutes.
        """
        events = self._get_events(target_date, target_date)
        slots = find_free_slots(events, date.fromisoformat(target_date), duration_minutes, self.timezone)
        self.actions.append({"type": "found", "label": f"Đã tìm thấy {len(slots)} khung giờ phù hợp", "event_ids": []})
        return {"count": len(slots), "slots": slots[:8]}

    def auto_plan_study_sessions(
        self,
        subject: str,
        exam_date: str,
        total_hours: float,
        session_duration: int,
    ) -> dict:
        """Distribute study sessions before an exam without calendar conflicts.

        Args:
            subject: Subject to study.
            exam_date: Exam date in YYYY-MM-DD format.
            total_hours: Total study hours required.
            session_duration: Length of each session in minutes.
        """
        events = self._get_events(date.today().isoformat(), exam_date)
        sessions = distribute_study_sessions(
            events, subject, date.fromisoformat(exam_date), total_hours, session_duration, self.timezone
        )
        if not sessions:
            return {"error": "Không tìm được khung giờ phù hợp trước ngày thi."}
        created = self.client.table("events").insert(
            [{**session, "user_id": self.user_id} for session in sessions]
        ).execute().data
        ids = [row["id"] for row in created]
        self.actions.append(
            {"type": "created", "label": f"Đã thêm {len(created)} buổi học {subject} vào lịch", "event_ids": ids}
        )
        return {"created_count": len(created), "events": created}

    def _get_events(self, start_date: str, end_date: str) -> list[dict]:
        start = start_date if "T" in start_date else f"{start_date}T00:00:00+00:00"
        end = end_date if "T" in end_date else f"{end_date}T23:59:59+00:00"
        return (
            self.client.table("events")
            .select("*")
            .eq("user_id", self.user_id)
            .lt("start_time", end)
            .gt("end_time", start)
            .order("start_time")
            .execute()
            .data
        )

    def _has_conflict(self, start_time: str, end_time: str, exclude_id: str | None = None) -> bool:
        query = (
            self.client.table("events")
            .select("id")
            .eq("user_id", self.user_id)
            .lt("start_time", end_time)
            .gt("end_time", start_time)
        )
        if exclude_id:
            query = query.neq("id", exclude_id)
        return bool(query.limit(1).execute().data)
