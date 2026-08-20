from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class Message(BaseModel):
    id: UUID | None = None
    role: Literal["user", "assistant", "system"]
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=12000)
    conversation_id: UUID | None = None


class ConversationUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=100)


class CalendarAction(BaseModel):
    type: Literal["created", "updated", "deleted", "found"]
    label: str
    event_ids: list[str] = Field(default_factory=list)


class ChatResponse(BaseModel):
    conversation_id: UUID
    message: Message
    actions: list[CalendarAction] = Field(default_factory=list)
