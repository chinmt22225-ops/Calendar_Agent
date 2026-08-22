from google.genai import errors

from agent.gemini_agent import _agent_error, fallback_conversation_title


def test_fallback_title_does_not_cut_a_word_in_half():
    title = fallback_conversation_title(
        "Hãy giúp tôi thiết lập lại thời khóa biểu học kỳ mới từ ảnh đính kèm"
    )

    assert len(title) <= 52
    assert title.endswith("học kỳ mới")


def test_daily_gemini_quota_is_non_retryable_for_the_client():
    exc = errors.ClientError(429, {
        "error": {
            "code": 429,
            "message": "Quota exceeded for generate_content_free_tier_requests",
            "details": [{
                "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                "violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}],
            }],
        }
    })

    result = _agent_error(exc)

    assert result.status_code == 429
    assert result.headers == {"X-Planora-Error-Code": "gemini_daily_quota"}
    assert "trong ngày" in result.detail


def test_transient_gemini_rate_limit_keeps_retry_delay():
    exc = errors.ClientError(429, {
        "error": {
            "code": 429,
            "message": "Too many requests",
            "details": [{
                "@type": "type.googleapis.com/google.rpc.RetryInfo",
                "retryDelay": "2.8s",
            }],
        }
    })

    result = _agent_error(exc)

    assert result.headers == {
        "X-Planora-Error-Code": "gemini_rate_limit",
        "Retry-After": "3",
    }
