from agent.gemini_agent import MAX_HISTORY_CHARACTERS, _history_contents


def test_history_is_bounded_by_character_budget_and_keeps_latest_messages():
    history = [
        {
            "role": "user" if index % 2 == 0 else "assistant",
            "content": str(index) + "x" * 11_999,
        }
        for index in range(20)
    ]
    contents = _history_contents(history)
    texts = [part.parts[0].text for part in contents]
    assert sum(len(text) for text in texts) <= MAX_HISTORY_CHARACTERS
    assert texts[-1].startswith("19")
    assert not any(text.startswith("0") for text in texts)
