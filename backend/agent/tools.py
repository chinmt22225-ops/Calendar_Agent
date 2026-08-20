from datetime import date, datetime, time
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field
from supabase import Client

from agent.recurrence import events_overlap, iter_occurrences
from agent.scheduler_logic import distribute_study_sessions, find_free_slots
from models.event import EventCreate


class ToolEvent(BaseModel):
    title: str
    start_time: str
    end_time: str
    description: str = ""
    category: str = "Học tập"
    color: str = Field(default="#2563eb", pattern=r"^#[0-9a-fA-F]{6}$")
    all_day: bool = False
    recurrence_rule: Literal["daily", "weekly", "monthly"] | None = None
    recurrence_end: str | None = None


class CalendarTools:
    def __init__(self, client: Client, user_id: UUID, timezone: str):
        self.client = client
        self.user_id = str(user_id)
        profiles = client.table("profiles").select("timezone,day_start,day_end").eq("id", self.user_id).limit(1).execute().data
        profile = profiles[0] if profiles else {}
        self.timezone = profile.get("timezone") or timezone
        self.day_start = time.fromisoformat(profile.get("day_start") or "07:00")
        self.day_end = time.fromisoformat(profile.get("day_end") or "22:00")
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
        all_day: bool = False,
        recurrence_rule: Literal["daily", "weekly", "monthly"] | None = None,
        recurrence_end: str | None = None,
    ) -> dict:
        """Create one calendar event for the signed-in user.

        Args:
            title: Concise event title.
            start_time: ISO datetime including timezone.
            end_time: ISO datetime including timezone and later than start_time.
            description: Optional notes.
            category: Subject or event group.
            color: Six-digit hexadecimal color.
            all_day: Whether this is an all-day event.
            recurrence_rule: Optional daily, weekly, or monthly recurrence.
            recurrence_end: Inclusive YYYY-MM-DD end date, required for recurrence.
        """
        result = self.create_calendar_events([ToolEvent(
            title=title, start_time=start_time, end_time=end_time,
            description=description, category=category, color=color, all_day=all_day,
            recurrence_rule=recurrence_rule,
            recurrence_end=recurrence_end,
        )])
        if "error" in result:
            return result
        return result["events"][0]

    def create_calendar_events(self, events: list[ToolEvent]) -> dict:
        """Create one or more non-overlapping calendar events.

        Args:
            events: Events with title, ISO times, category, color and optional recurrence.
        """
        if not events:
            return {"error": "Danh sách sự kiện đang trống."}
        payloads: list[dict] = []
        for event in events:
            try:
                candidate = EventCreate.model_validate({
                    **event.model_dump(mode="json"), "status": "scheduled", "is_ai_generated": True,
                }).model_dump(mode="json")
            except ValueError as exc:
                return {"error": f"Dữ liệu của '{event.title}' không hợp lệ: {exc}"}
            if self._event_conflict(candidate, additional=payloads):
                return {"error": f"'{event.title}' đang trùng với một sự kiện khác. Hãy tìm khung giờ khác."}
            payloads.append({"user_id": self.user_id, **candidate})
        created = self.client.table("events").insert(payloads).execute().data
        ids = [row["id"] for row in created]
        label = f"Đã thêm {len(created)} sự kiện vào lịch" if len(created) > 1 else f"Đã thêm {created[0]['title']} vào lịch"
        self.actions.append({"type": "created", "label": label, "event_ids": ids})
        return {"created_count": len(created), "events": created}

    def reschedule_event(self, event_id: str, new_start: str, new_end: str) -> dict:
        """Move an existing event or recurrence series to a new ISO time range.

        Args:
            event_id: Existing event UUID.
            new_start: New ISO start datetime with timezone.
            new_end: New ISO end datetime with timezone.
        """
        current = self.client.table("events").select("*").eq("id", event_id).eq("user_id", self.user_id).is_("deleted_at", "null").limit(1).execute().data
        if not current:
            return {"error": "Không tìm thấy sự kiện."}
        candidate = {**current[0], "start_time": new_start, "end_time": new_end}
        if self._event_conflict(candidate, exclude_id=event_id):
            return {"error": "Khung giờ mới đang trùng với một sự kiện khác."}
        rows = self.client.table("events").update({"start_time": new_start, "end_time": new_end}).eq("id", event_id).eq("user_id", self.user_id).execute().data
        self.actions.append({"type": "updated", "label": f"Đã dời {rows[0]['title']}", "event_ids": [event_id]})
        return rows[0]

    def delete_calendar_event(self, event_id: str) -> dict:
        """Move one calendar event to Trash by UUID.

        Args:
            event_id: Existing event UUID.
        """
        rows = self.client.table("events").update({"deleted_at": datetime.now().astimezone().isoformat()}).eq("id", event_id).eq("user_id", self.user_id).is_("deleted_at", "null").execute().data
        if not rows:
            return {"error": "Không tìm thấy sự kiện."}
        self.actions.append({"type": "deleted", "label": f"Đã chuyển {rows[0]['title']} vào Thùng rác", "event_ids": [event_id]})
        return {"deleted": True, "event": rows[0]}

    def find_free_time_slots(self, target_date: str, duration_minutes: int) -> dict:
        """Find available study slots on a date.

        Args:
            target_date: Date in YYYY-MM-DD format.
            duration_minutes: Required uninterrupted duration in minutes.
        """
        events = self._get_events(target_date, target_date)
        slots = find_free_slots(events, date.fromisoformat(target_date), duration_minutes, self.timezone, self.day_start, self.day_end)
        self.actions.append({"type": "found", "label": f"Đã tìm thấy {len(slots)} khung giờ phù hợp", "event_ids": []})
        return {"count": len(slots), "slots": slots[:8]}

    def auto_plan_study_sessions(self, subject: str, exam_date: str, total_hours: float, session_duration: int) -> dict:
        """Distribute study sessions before an exam without calendar conflicts.

        Args:
            subject: Subject to study.
            exam_date: Exam date in YYYY-MM-DD format.
            total_hours: Total study hours required.
            session_duration: Length of each session in minutes.
        """
        today = datetime.now(ZoneInfo(self.timezone)).date()
        events = self._get_events(today.isoformat(), exam_date)
        sessions = distribute_study_sessions(
            events, subject, date.fromisoformat(exam_date), total_hours, session_duration,
            self.timezone, day_start=self.day_start, day_end=self.day_end,
        )
        if not sessions:
            return {"error": "Không tìm được khung giờ phù hợp trước ngày thi."}
        created = self.client.table("events").insert([{**session, "user_id": self.user_id} for session in sessions]).execute().data
        ids = [row["id"] for row in created]
        self.actions.append({"type": "created", "label": f"Đã thêm {len(created)} buổi học {subject} vào lịch", "event_ids": ids})
        return {"created_count": len(created), "events": created}

    def _get_events(self, start_date: str, end_date: str) -> list[dict]:
        tz = ZoneInfo(self.timezone)
        start = start_date if "T" in start_date else datetime.combine(date.fromisoformat(start_date), time.min, tzinfo=tz).isoformat()
        end = end_date if "T" in end_date else datetime.combine(date.fromisoformat(end_date), time.max, tzinfo=tz).isoformat()
        rows = self.client.table("events").select("*").eq("user_id", self.user_id).eq("status", "scheduled").is_("deleted_at", "null").lt("start_time", end).or_(f"end_time.gt.{start},recurrence_end.gte.{start[:10]}").order("start_time").execute().data
        range_start = datetime.fromisoformat(start.replace("Z", "+00:00"))
        range_end = datetime.fromisoformat(end.replace("Z", "+00:00"))
        expanded: list[dict] = []
        for row in rows:
            recurrence_end = date.fromisoformat(row["recurrence_end"]) if row.get("recurrence_end") else None
            for occurrence_start, occurrence_end in iter_occurrences(
                datetime.fromisoformat(row["start_time"].replace("Z", "+00:00")),
                datetime.fromisoformat(row["end_time"].replace("Z", "+00:00")),
                row.get("recurrence_rule"), recurrence_end,
            ):
                if occurrence_start >= range_end:
                    break
                if occurrence_end > range_start:
                    expanded.append({**row, "series_id": row["id"], "start_time": occurrence_start.isoformat(), "end_time": occurrence_end.isoformat()})
        return sorted(expanded, key=lambda item: item["start_time"])

    def _active_events(self) -> list[dict]:
        return self.client.table("events").select("*").eq("user_id", self.user_id).eq("status", "scheduled").is_("deleted_at", "null").order("start_time").execute().data

    def _event_conflict(self, candidate: dict, exclude_id: str | None = None, additional: list[dict] | None = None) -> bool:
        return events_overlap(candidate, [*self._active_events(), *(additional or [])], exclude_id) is not None
