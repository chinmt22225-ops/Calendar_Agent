from datetime import datetime, time
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator, model_validator


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=100)
    timezone: str | None = None
    day_start: time | None = None
    day_end: time | None = None
    pomodoro_minutes: int | None = Field(default=None, ge=15, le=120)

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return value
        clean = value.strip()
        try:
            ZoneInfo(clean)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("Múi giờ không thuộc danh sách IANA hợp lệ") from exc
        return clean

    @model_validator(mode="after")
    def validate_day_range(self):
        if self.day_start is not None and self.day_end is not None:
            if self.day_end <= self.day_start:
                raise ValueError("day_end phải sau day_start")
        return self


class ProfileOut(BaseModel):
    id: UUID
    display_name: str | None = None
    timezone: str
    day_start: time
    day_end: time
    pomodoro_minutes: int
    created_at: datetime
    updated_at: datetime
