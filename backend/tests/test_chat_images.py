import base64

import pytest
from pydantic import ValidationError

from agent.gemini_agent import _user_content
from models.chat import ChatRequest
from routes.chat import _request_fingerprint


def test_image_only_chat_request_and_gemini_parts():
    encoded = base64.b64encode(b"small-image").decode()
    request = ChatRequest(message="", images=[{"mime_type": "image/png", "data": encoded}])
    content = _user_content(request.message, request.images)
    assert len(content.parts) == 2
    assert content.parts[0].text
    assert content.parts[1].inline_data.mime_type == "image/png"
    assert content.parts[1].inline_data.data == b"small-image"


def test_chat_request_rejects_empty_content():
    with pytest.raises(ValidationError):
        ChatRequest(message="", images=[])


def test_chat_request_rejects_invalid_base64():
    with pytest.raises(ValidationError):
        ChatRequest(message="x", images=[{"mime_type": "image/jpeg", "data": "not-base64"}])


def test_chat_operation_fingerprint_is_stable_and_payload_sensitive():
    encoded = base64.b64encode(b"image-a").decode()
    first = ChatRequest(
        message="Lập lịch học",
        images=[{"mime_type": "image/png", "data": encoded}],
    )
    same = ChatRequest(
        message="Lập lịch học",
        images=[{"mime_type": "image/png", "data": encoded}],
    )
    changed = ChatRequest(message="Lập lịch môn khác")
    assert _request_fingerprint(first) == _request_fingerprint(same)
    assert _request_fingerprint(first) != _request_fingerprint(changed)
