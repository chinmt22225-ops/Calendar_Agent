import logging
from datetime import date, datetime, time, timezone
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

from pydantic import BaseModel, Field, ValidationError
from postgrest.exceptions import APIError as PostgrestAPIError
from supabase import Client

from agent.recurrence import events_overlap, iter_occurrences
from agent.scheduler_logic import (
    MAX_PLANNING_DAYS,
    distribute_study_sessions,
    find_free_slots,
    planned_minutes,
)
from models.event import EventCreate
from models.task import StudyTaskCreate, StudyTaskUpdate


class ToolEvent(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    start_time: str
    end_time: str
    description: str = Field(default="", max_length=5000)
    category: str = Field(default="Học tập", min_length=1, max_length=60)
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

    def available_tools(self) -> list:
        """Return the exact callable set exposed to Gemini."""
        return [
            self.get_current_schedule,
            self.create_calendar_events,
            self.create_calendar_event,
            self.reschedule_event,
            self.delete_calendar_event,
            self.find_free_time_slots,
            self.auto_plan_study_sessions,
            self.get_study_tasks,
            self.create_study_task,
            self.update_study_task,
            self.delete_study_task,
        ]

    def execute_tool(self, name: str, arguments: dict) -> dict:
        """Validate and execute one model-requested tool by allow-listed name."""
        tools = {tool.__name__: tool for tool in self.available_tools()}
        tool = tools.get(name)
        if tool is None:
            return {"error": f"Công cụ '{name}' không tồn tại."}
        clean_arguments = dict(arguments or {})
        try:
            if name == "create_calendar_events":
                clean_arguments["events"] = [
                    item if isinstance(item, ToolEvent) else ToolEvent.model_validate(item)
                    for item in clean_arguments.get("events", [])
                ]
            result = tool(**clean_arguments)
            return result if isinstance(result, dict) else {"result": result}
        except (TypeError, ValueError, ValidationError) as exc:
            return {"error": f"Tham số công cụ không hợp lệ: {exc}"}
        except PostgrestAPIError as exc:
            return {"error": _calendar_database_error(exc)}

    def get_current_schedule(self, start_date: str, end_date: str) -> dict:
        """Get the user's events between two ISO date or datetime values.

        Args:
            start_date: Inclusive ISO start date or datetime.
            end_date: Inclusive ISO end date or datetime.
        """
        try:
            events = self._get_events(start_date, end_date)
        except ValueError as exc:
            return {"error": str(exc)}
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
        """Thêm một hoặc nhiều sự kiện vào lịch trong cơ sở dữ liệu (tối đa 50 sự kiện).
        BẮT BUỘC SỬ DỤNG CÔNG CỤ NÀY khi người dùng muốn thêm thời khóa biểu từ ảnh, thêm lịch học kỳ, hoặc tạo nhiều môn học.

        Args:
            events: Danh sách các sự kiện. Mỗi sự kiện bắt buộc gồm:
                - title: Tên sự kiện / môn học (VD: 'Xác suất thống kê (LT)')
                - start_time: Thời gian bắt đầu ISO có múi giờ (VD: '2026-09-28T07:30:00+07:00')
                - end_time: Thời gian kết thúc ISO có múi giờ (VD: '2026-09-28T11:00:00+07:00')
                - description: Ghi chú, phòng học, mã lớp (VD: 'Phòng cs2:PMT_NĐH4.3')
                - category: Danh mục / Tên môn (VD: 'Học tập', 'Xác suất thống kê')
                - color: Mã màu hex (VD: '#2563eb', '#e11d48', '#059669', '#d97706')
                - all_day: False cho các tiết học có giờ cụ thể
                - recurrence_rule: 'weekly' nếu lặp hàng tuần, 'daily' nếu lặp hàng ngày, hoặc None
                - recurrence_end: Ngày kết thúc lặp định dạng YYYY-MM-DD (VD: '2027-01-17')
        """
        if not events:
            return {"error": "Danh sách sự kiện đang trống."}
        if len(events) > 50:
            return {"error": "Mỗi lần chỉ được tạo tối đa 50 sự kiện."}
        payloads: list[dict] = []
        skipped_conflicts: list[str] = []
        validation_errors: list[str] = []
        for event in events:
            try:
                candidate = EventCreate.model_validate({
                    **event.model_dump(mode="json"), "status": "scheduled", "is_ai_generated": True,
                }).model_dump(mode="json")
            except ValueError as exc:
                validation_errors.append(f"'{event.title}': {exc}")
                logger.warning("Validation error for event '%s': %s", event.title, exc)
                continue
            if self._event_conflict(candidate, additional=payloads):
                skipped_conflicts.append(event.title)
                logger.info("Skipping '%s' due to conflict with existing event.", event.title)
                continue
            payloads.append({"user_id": self.user_id, **candidate})
        if not payloads:
            msg = "Tất cả sự kiện đều bị trùng lịch với các sự kiện hiện có."
            if skipped_conflicts:
                msg += f" Bị trùng: {', '.join(skipped_conflicts)}."
            if validation_errors:
                msg += f" Lỗi dữ liệu: {'; '.join(validation_errors)}."
            logger.warning("create_calendar_events: No events to create. skipped=%s", skipped_conflicts)
            return {"error": msg}
        try:
            logger.info("Creating %d events via RPC (skipping %d conflicts)", len(payloads), len(skipped_conflicts))
            created = self.client.rpc("create_calendar_events_atomic", {
                "p_user_id": self.user_id,
                "p_events": payloads,
            }).execute().data
        except PostgrestAPIError as exc:
            logger.error("RPC create_calendar_events_atomic error: %s", exc)
            return {"error": _calendar_database_error(exc)}
        if not created:
            logger.error("create_calendar_events_atomic returned empty result for %d payloads", len(payloads))
            return {"error": "Không thể tạo sự kiện lúc này."}
        ids = [row["id"] for row in created]
        label = f"Đã thêm {len(created)} sự kiện vào lịch" if len(created) > 1 else f"Đã thêm {created[0]['title']} vào lịch"
        self.actions.append({"type": "created", "label": label, "event_ids": ids})
        result: dict = {"created_count": len(created), "events": created}
        if skipped_conflicts:
            result["skipped_conflicts"] = skipped_conflicts
            result["skipped_count"] = len(skipped_conflicts)
        if validation_errors:
            result["validation_errors"] = validation_errors
        logger.info("create_calendar_events: created=%d, skipped=%d", len(created), len(skipped_conflicts))
        return result


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
        try:
            candidate = EventCreate.model_validate(
                {**current[0], "start_time": new_start, "end_time": new_end}
            ).model_dump(mode="json")
        except ValueError as exc:
            return {"error": f"Thời gian mới không hợp lệ: {exc}"}
        if self._event_conflict(candidate, exclude_id=event_id):
            return {"error": "Khung giờ mới đang trùng với một sự kiện khác."}
        try:
            updated = self.client.rpc("update_calendar_event_atomic", {
                "p_user_id": self.user_id,
                "p_event_id": event_id,
                "p_event": candidate,
            }).execute().data
        except PostgrestAPIError as exc:
            return {"error": _calendar_database_error(exc)}
        if isinstance(updated, list):
            updated = updated[0] if updated else None
        if not updated:
            return {"error": "Không thể dời sự kiện lúc này."}
        self.actions.append({"type": "updated", "label": f"Đã dời {updated['title']}", "event_ids": [event_id]})
        return updated

    def delete_calendar_event(self, event_id: str) -> dict:
        """Move one calendar event to Trash by UUID.

        Args:
            event_id: Existing event UUID.
        """
        rows = self.client.table("events").update({"deleted_at": datetime.now(timezone.utc).isoformat()}).eq("id", event_id).eq("user_id", self.user_id).is_("deleted_at", "null").execute().data
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
        if not 5 <= duration_minutes <= 12 * 60:
            return {"error": "Thời lượng cần tìm phải từ 5 đến 720 phút."}
        try:
            target = date.fromisoformat(target_date)
            events = self._get_events(target_date, target_date)
            slots = find_free_slots(events, target, duration_minutes, self.timezone, self.day_start, self.day_end)
        except ValueError as exc:
            return {"error": f"Yêu cầu tìm giờ trống không hợp lệ: {exc}"}
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
        clean_subject = subject.strip()
        if not clean_subject or len(clean_subject) > 80:
            return {"error": "Tên môn học phải có từ 1 đến 80 ký tự."}
        today = datetime.now(ZoneInfo(self.timezone)).date()
        try:
            parsed_exam_date = date.fromisoformat(exam_date)
            events = self._get_events(today.isoformat(), exam_date)
            sessions = distribute_study_sessions(
                events, clean_subject, parsed_exam_date, total_hours, session_duration,
                self.timezone, day_start=self.day_start, day_end=self.day_end,
            )
        except ValueError as exc:
            return {"error": f"Không thể lập kế hoạch: {exc}"}
        requested = round(total_hours * 60)
        planned = planned_minutes(sessions)
        remaining = max(0, requested - planned)
        if not sessions:
            return {
                "error": "Không tìm được khung giờ phù hợp trước ngày thi.",
                "requested_minutes": requested,
                "planned_minutes": 0,
                "remaining_minutes": requested,
                "complete": False,
            }
        try:
            created = self.client.rpc("create_calendar_events_atomic", {
                "p_user_id": self.user_id,
                "p_events": sessions,
            }).execute().data
        except PostgrestAPIError as exc:
            return {"error": _calendar_database_error(exc)}
        if not created:
            return {"error": "Không thể lưu kế hoạch học lúc này."}
        ids = [row["id"] for row in created]
        label = f"Đã thêm {len(created)} buổi học {clean_subject} vào lịch"
        if remaining:
            label += f", còn thiếu {remaining} phút chưa thể sắp xếp"
        self.actions.append({"type": "created", "label": label, "event_ids": ids})
        return {
            "created_count": len(created),
            "events": created,
            "requested_minutes": requested,
            "planned_minutes": planned,
            "remaining_minutes": remaining,
            "complete": remaining == 0,
        }

    def get_study_tasks(
        self,
        deadline_from: str | None = None,
        deadline_to: str | None = None,
        status: Literal["pending", "planned", "completed"] | None = None,
        subject: str | None = None,
    ) -> dict:
        """List study tasks and deadlines owned by the signed-in user.

        Args:
            deadline_from: Optional inclusive YYYY-MM-DD lower deadline.
            deadline_to: Optional inclusive YYYY-MM-DD upper deadline.
            status: Optional pending, planned, or completed status.
            subject: Optional exact subject filter.
        """
        try:
            start = date.fromisoformat(deadline_from) if deadline_from else None
            end = date.fromisoformat(deadline_to) if deadline_to else None
        except ValueError:
            return {"error": "Deadline phải có dạng YYYY-MM-DD."}
        if start and end and end < start:
            return {"error": "deadline_to phải bằng hoặc sau deadline_from."}
        if start and end and (end - start).days > 366:
            return {"error": "Chỉ được tra cứu deadline trong tối đa 366 ngày."}
        query = self.client.table("study_tasks").select("*").eq("user_id", self.user_id)
        if start:
            query = query.gte("deadline", start.isoformat())
        if end:
            query = query.lte("deadline", end.isoformat())
        if status:
            query = query.eq("status", status)
        rows = query.order("deadline").limit(200).execute().data
        clean_subject = subject.strip().casefold() if subject else None
        if clean_subject:
            rows = [row for row in rows if str(row.get("subject", "")).strip().casefold() == clean_subject]
        return {"count": len(rows), "tasks": rows}

    def create_study_task(
        self,
        title: str,
        subject: str,
        estimated_hours: float,
        deadline: str,
        priority: int = 2,
    ) -> dict:
        """Create a study task with a deadline.

        Args:
            title: Concise task title.
            subject: Course or subject name.
            estimated_hours: Positive estimated effort in hours.
            deadline: Deadline in YYYY-MM-DD format.
            priority: Priority from 1 (high) to 3 (low).
        """
        try:
            payload = StudyTaskCreate.model_validate({
                "title": title,
                "subject": subject,
                "estimated_hours": estimated_hours,
                "deadline": deadline,
                "priority": priority,
                "status": "pending",
            }).model_dump(mode="json")
        except ValidationError as exc:
            return {"error": f"Dữ liệu nhiệm vụ không hợp lệ: {exc}"}
        rows = self.client.table("study_tasks").insert({
            **payload, "user_id": self.user_id,
        }).execute().data
        if not rows:
            return {"error": "Không thể tạo nhiệm vụ lúc này."}
        task = rows[0]
        self.actions.append({
            "type": "task_created",
            "label": f"Đã thêm nhiệm vụ {task['title']}",
            "event_ids": [task["id"]],
        })
        return task

    def update_study_task(
        self,
        task_id: str,
        title: str | None = None,
        subject: str | None = None,
        estimated_hours: float | None = None,
        deadline: str | None = None,
        priority: int | None = None,
        status: Literal["pending", "planned", "completed"] | None = None,
    ) -> dict:
        """Update fields or completion status of an existing study task.

        Args:
            task_id: Existing task UUID.
            title: Optional new title.
            subject: Optional new subject.
            estimated_hours: Optional new positive estimate.
            deadline: Optional new YYYY-MM-DD deadline.
            priority: Optional priority from 1 to 3.
            status: Optional pending, planned, or completed status.
        """
        supplied = {
            key: value for key, value in {
                "title": title, "subject": subject, "estimated_hours": estimated_hours,
                "deadline": deadline, "priority": priority, "status": status,
            }.items() if value is not None
        }
        if not supplied:
            return {"error": "Không có thay đổi nào cho nhiệm vụ."}
        try:
            changes = StudyTaskUpdate.model_validate(supplied).model_dump(
                exclude_none=True, mode="json"
            )
        except ValidationError as exc:
            return {"error": f"Dữ liệu nhiệm vụ không hợp lệ: {exc}"}
        rows = self.client.table("study_tasks").update(changes).eq(
            "id", task_id
        ).eq("user_id", self.user_id).execute().data
        if not rows:
            return {"error": "Không tìm thấy nhiệm vụ."}
        task = rows[0]
        self.actions.append({
            "type": "task_updated",
            "label": f"Đã cập nhật nhiệm vụ {task['title']}",
            "event_ids": [task["id"]],
        })
        return task

    def delete_study_task(self, task_id: str) -> dict:
        """Delete one study task by UUID.

        Args:
            task_id: Existing task UUID.
        """
        rows = self.client.table("study_tasks").delete().eq(
            "id", task_id
        ).eq("user_id", self.user_id).execute().data
        if not rows:
            return {"error": "Không tìm thấy nhiệm vụ."}
        task = rows[0]
        self.actions.append({
            "type": "task_deleted",
            "label": f"Đã xóa nhiệm vụ {task['title']}",
            "event_ids": [task_id],
        })
        return {"deleted": True, "task": task}

    def _get_events(self, start_date: str, end_date: str) -> list[dict]:
        tz = ZoneInfo(self.timezone)
        start_day = _date_part(start_date)
        end_day = _date_part(end_date)
        if end_day < start_day:
            raise ValueError("Ngày kết thúc phải bằng hoặc sau ngày bắt đầu")
        if (end_day - start_day).days > MAX_PLANNING_DAYS:
            raise ValueError(f"Khoảng thời gian không được vượt quá {MAX_PLANNING_DAYS} ngày")
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


def _date_part(value: str) -> date:
    if "T" not in value:
        return date.fromisoformat(value)
    return datetime.fromisoformat(value.replace("Z", "+00:00")).date()


def _calendar_database_error(exc: PostgrestAPIError) -> str:
    message = str(getattr(exc, "message", "") or exc)
    marker = "calendar_conflict:"
    if marker in message:
        title = message.split(marker, 1)[1].splitlines()[0].strip()
        return f"Khung giờ đang trùng với '{title}'."
    return "Không thể lưu thay đổi lịch lúc này."
