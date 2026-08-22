from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from google.genai import errors, types

from agent.gemini_agent import CalendarAgentSession
from agent.model_registry import (
    MODEL_MAP,
    ORDERED_MODELS,
    get_available_models,
    resolve_fallback_chain,
)


def test_models_descending_intelligence():
    """Verify that models are ordered by intelligence descending."""
    scores = [m.intelligence_score for m in ORDERED_MODELS]
    for i in range(len(scores) - 1):
        assert scores[i] >= scores[i + 1], f"Model {ORDERED_MODELS[i].id} ({scores[i]}) should have >= intelligence than {ORDERED_MODELS[i+1].id} ({scores[i+1]})"


def test_resolve_fallback_chain_auto():
    """Verify auto chain begins with high speed vision models."""
    chain = resolve_fallback_chain("auto", has_images=False, has_groq_key=False)
    assert len(chain) >= 3
    assert chain[0].id == "gemini-3.5-flash-lite"
    assert chain[0].intelligence_score == 9.8


def test_resolve_fallback_chain_with_images():
    """Verify image requests only include models that support vision."""
    chain = resolve_fallback_chain("auto", has_images=True, has_groq_key=True)
    for model in chain:
        assert model.supports_vision is True


def test_resolve_fallback_chain_specific_selection():
    """Verify selecting a specific model puts it first in the chain."""
    chain = resolve_fallback_chain("gemini-3.5-flash", has_images=False, has_groq_key=False)
    assert chain[0].id == "gemini-3.5-flash"
    assert any(m.id == "gemini-3.6-flash" for m in chain[1:])


def test_cascading_fallback_on_rate_limit():
    """Verify automatic cascading failover when primary model returns 429."""
    user_id = uuid4()
    mock_supabase = MagicMock()
    mock_supabase.table().select().eq().limit().execute().data = []

    with patch("agent.gemini_agent.get_settings") as mock_settings:
        mock_settings.return_value.gemini_configured = True
        mock_settings.return_value.gemini_api_key = "test_key"
        mock_settings.return_value.gemini_model = "auto"
        mock_settings.return_value.groq_configured = False
        mock_settings.return_value.default_timezone = "Asia/Ho_Chi_Minh"

        session = CalendarAgentSession(user_id, mock_supabase, history=[])

        # Model 1 throws 429 Quota/Rate limit error
        error_429 = errors.ClientError(
            code=429,
            response_json={"error": {"message": "Resource has been exhausted"}},
        )

        # Model 2 returns valid response
        success_response = MagicMock()
        success_response.function_calls = []
        part = types.Part(text="Đã xếp lịch học thành công!")
        success_response.candidates = [types.Candidate(content=types.Content(parts=[part]))]

        calls = []

        def mock_generate_content(model, contents, config):
            calls.append(model)
            if len(calls) == 1:
                raise error_429
            return success_response

        session.client.models.generate_content = MagicMock(side_effect=mock_generate_content)

        result = session.run("Xếp lịch học")
        assert result == "Đã xếp lịch học thành công!"
        assert len(calls) == 2
        assert calls[0] == "gemini-3.5-flash-lite"
        assert session.model_used != "gemini-3.5-flash-lite"
