from datetime import date

from agent.scheduler_logic import find_free_slots


def test_free_slots_avoid_busy_event():
    events = [
        {
            "start_time": "2026-08-21T08:00:00+07:00",
            "end_time": "2026-08-21T10:00:00+07:00",
        }
    ]
    slots = find_free_slots(events, date(2026, 8, 21), 60)
    assert slots
    assert all(not (slot["start"] < events[0]["end_time"] and slot["end"] > events[0]["start_time"]) for slot in slots)


def test_free_slots_are_requested_duration():
    slots = find_free_slots([], date(2026, 8, 21), 90)
    assert slots[0] == {
        "start": "2026-08-21T07:00:00+07:00",
        "end": "2026-08-21T08:30:00+07:00",
    }

