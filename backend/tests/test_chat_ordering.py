from routes.chat import _ordered_messages


def test_messages_with_the_same_timestamp_keep_user_before_assistant():
    timestamp = "2026-08-21T08:00:00+00:00"
    rows = [
        {"id": "assistant", "role": "assistant", "created_at": timestamp},
        {"id": "user", "role": "user", "created_at": timestamp},
    ]

    ordered = _ordered_messages(rows)

    assert [row["role"] for row in ordered] == ["user", "assistant"]
