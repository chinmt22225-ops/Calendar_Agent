from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class StudyTaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    subject: str = Field(min_length=1, max_length=80)
    estimated_hours: float = Field(gt=0, le=500)
    deadline: date
    priority: int = Field(default=2, ge=1, le=3)
    status: Literal["pending", "planned", "completed"] = "pending"

    @field_validator("title", "subject")
    @classmethod
    def clean_required_text(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("Trường bắt buộc không thể chỉ chứa khoảng trắng")
        return clean


class StudyTaskCreate(StudyTaskBase):
    pass


class StudyTaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=180)
    subject: str | None = Field(default=None, min_length=1, max_length=80)
    estimated_hours: float | None = Field(default=None, gt=0, le=500)
    deadline: date | None = None
    priority: int | None = Field(default=None, ge=1, le=3)
    status: Literal["pending", "planned", "completed"] | None = None

    @field_validator("title", "subject")
    @classmethod
    def clean_optional_required_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        clean = value.strip()
        if not clean:
            raise ValueError("Trường bắt buộc không thể chỉ chứa khoảng trắng")
        return clean


class StudyTaskOut(StudyTaskBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
