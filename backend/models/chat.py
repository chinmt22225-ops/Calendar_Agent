from datetime import datetime
import base64
import binascii
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


class Message(BaseModel):
    id: UUID | None = None
    role: Literal["user", "assistant", "system"]
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None


class ChatImage(BaseModel):
    mime_type: Literal["image/jpeg", "image/png", "image/webp", "image/gif"]
    data: str = Field(min_length=1, max_length=5_600_000)

    @field_validator("data")
    @classmethod
    def validate_image_data(cls, value: str) -> str:
        try:
            decoded = base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("Dữ liệu ảnh không phải Base64 hợp lệ") from exc
        if len(decoded) > 4 * 1024 * 1024:
            raise ValueError("Mỗi ảnh không được vượt quá 4 MB")
        return value

    def as_bytes(self) -> bytes:
        return base64.b64decode(self.data, validate=True)


class ChatRequest(BaseModel):
    message: str = Field(default="", max_length=12000)
    conversation_id: UUID | None = None
    operation_id: UUID | None = None
    images: list[ChatImage] = Field(default_factory=list, max_length=3)

    @model_validator(mode="after")
    def validate_content(self):
        if not self.message.strip() and not self.images:
            raise ValueError("Tin nhắn cần có nội dung hoặc ít nhất một ảnh")
        return self


class ConversationUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=100)


class CalendarAction(BaseModel):
    type: Literal[
        "created", "updated", "deleted", "found",
        "task_created", "task_updated", "task_deleted", "tasks_found",
    ]
    label: str
    event_ids: list[str] = Field(default_factory=list)


class ChatResponse(BaseModel):
    conversation_id: UUID
    operation_id: UUID | None = None
    message: Message
    actions: list[CalendarAction] = Field(default_factory=list)
