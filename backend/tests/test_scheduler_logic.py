from datetime import date, datetime, time

from agent.scheduler_logic import distribute_study_sessions, find_free_slots, planned_minutes


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


def test_study_plan_fulfills_requested_minutes_with_multiple_sessions_per_day():
    sessions = distribute_study_sessions(
        [], "Toán", date(2026, 8, 23), 5, 60, today=date(2026, 8, 21)
    )
    assert len(sessions) == 5
    assert planned_minutes(sessions) == 300
    assert {item["start_time"][:10] for item in sessions} == {
        "2026-08-21",
        "2026-08-22",
    }


def test_study_plan_reports_exact_partial_capacity():
    sessions = distribute_study_sessions(
        [],
        "Toán",
        date(2026, 8, 23),
        3,
        60,
        today=date(2026, 8, 21),
        day_start=time(7),
        day_end=time(8),
    )
    assert len(sessions) == 2
    assert planned_minutes(sessions) == 120


def test_study_plan_uses_shorter_final_session():
    sessions = distribute_study_sessions(
        [], "Toán", date(2026, 8, 22), 2.5, 60, today=date(2026, 8, 21)
    )
    durations = [
        round(
            (
                datetime.fromisoformat(item["end_time"])
                - datetime.fromisoformat(item["start_time"])
            ).total_seconds()
            / 60
        )
        for item in sessions
    ]
    assert planned_minutes(sessions) == 150
    assert sorted(durations) == [30, 60, 60]
