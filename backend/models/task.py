from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class StudyTaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    subject: str = Field(min_length=1, max_length=80)
    estimated_hours: float = Field(gt=0, le=500)
    deadline: date
    priority: int = Field(default=2, ge=1, le=3)
    status: Literal["pending", "planned", "completed"] = "pending"


class StudyTaskCreate(StudyTaskBase):
    pass


class StudyTaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=180)
    subject: str | None = Field(default=None, min_length=1, max_length=80)
    estimated_hours: float | None = Field(default=None, gt=0, le=500)
    deadline: date | None = None
    priority: int | None = Field(default=None, ge=1, le=3)
    status: Literal["pending", "planned", "completed"] | None = None


class StudyTaskOut(StudyTaskBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

