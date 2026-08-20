from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


EventStatus = Literal["scheduled", "completed", "cancelled"]
RecurrenceRule = Literal["daily", "weekly", "monthly"]


class EventBase(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    description: str | None = None
    start_time: datetime
    end_time: datetime
    color: str = Field(default="#2563eb", pattern=r"^#[0-9a-fA-F]{6}$")
    category: str = Field(default="Học tập", min_length=1, max_length=60)
    status: EventStatus = "scheduled"
    is_ai_generated: bool = False
    all_day: bool = False
    recurrence_rule: RecurrenceRule | None = None
    recurrence_end: date | None = None

    @model_validator(mode="after")
    def validate_time_range(self):
        if self.start_time.utcoffset() is None or self.end_time.utcoffset() is None:
            raise ValueError("start_time và end_time phải kèm múi giờ")
        if self.end_time <= self.start_time:
            raise ValueError("end_time phải sau start_time")
        if bool(self.recurrence_rule) != bool(self.recurrence_end):
            raise ValueError("Sự kiện lặp lại cần có cả tần suất và ngày kết thúc")
        if self.recurrence_end and self.recurrence_end < self.start_time.date():
            raise ValueError("Ngày kết thúc lặp lại không thể trước ngày bắt đầu")
        return self


class EventCreate(EventBase):
    pass


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=180)
    description: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    category: str | None = Field(default=None, min_length=1, max_length=60)
    status: EventStatus | None = None
    all_day: bool | None = None
    recurrence_rule: RecurrenceRule | None = None
    recurrence_end: date | None = None


class EventOut(EventBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None
