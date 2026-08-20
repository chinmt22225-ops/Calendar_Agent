from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


EventStatus = Literal["scheduled", "completed", "cancelled"]


class EventBase(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    description: str | None = None
    start_time: datetime
    end_time: datetime
    color: str = Field(default="#2563eb", pattern=r"^#[0-9a-fA-F]{6}$")
    category: str = Field(default="Học tập", min_length=1, max_length=60)
    status: EventStatus = "scheduled"
    is_ai_generated: bool = False
    recurrence_rule: str | None = None

    @model_validator(mode="after")
    def validate_time_range(self):
        if self.end_time <= self.start_time:
            raise ValueError("end_time phải sau start_time")
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
    recurrence_rule: str | None = None


class EventOut(EventBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

