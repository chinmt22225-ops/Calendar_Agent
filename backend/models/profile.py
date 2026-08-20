from datetime import datetime, time
from uuid import UUID

from pydantic import BaseModel, Field


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=100)
    timezone: str | None = None
    day_start: time | None = None
    day_end: time | None = None
    pomodoro_minutes: int | None = Field(default=None, ge=15, le=120)


class ProfileOut(BaseModel):
    id: UUID
    display_name: str | None = None
    timezone: str
    day_start: time
    day_end: time
    pomodoro_minutes: int
    created_at: datetime
    updated_at: datetime

