from datetime import date, datetime, timezone

import pytest
from pydantic import ValidationError

from agent.recurrence import events_overlap, iter_occurrences
from models.event import EventCreate


def test_daily_recurrence_is_inclusive():
    start = datetime(2026, 8, 21, 8, tzinfo=timezone.utc)
    end = datetime(2026, 8, 21, 9, tzinfo=timezone.utc)
    occurrences = list(iter_occurrences(start, end, "daily", date(2026, 8, 23)))
    assert [item[0].date().isoformat() for item in occurrences] == ["2026-08-21", "2026-08-22", "2026-08-23"]


def test_monthly_recurrence_skips_month_without_day():
    start = datetime(2026, 1, 31, 8, tzinfo=timezone.utc)
    end = datetime(2026, 1, 31, 9, tzinfo=timezone.utc)
    occurrences = list(iter_occurrences(start, end, "monthly", date(2026, 5, 31)))
    assert [item[0].date().isoformat() for item in occurrences] == ["2026-01-31", "2026-03-31", "2026-05-31"]


def test_recurring_occurrence_conflicts_with_scheduled_event_only():
    candidate = {
        "start_time": "2026-08-21T08:00:00+00:00", "end_time": "2026-08-21T09:00:00+00:00",
        "recurrence_rule": "weekly", "recurrence_end": "2026-09-30", "status": "scheduled",
    }
    existing = [
        {"id": "cancelled", "title": "Đã hủy", "start_time": "2026-08-28T08:00:00+00:00", "end_time": "2026-08-28T09:00:00+00:00", "status": "cancelled", "deleted_at": None},
        {"id": "active", "title": "Đang học", "start_time": "2026-09-04T08:30:00+00:00", "end_time": "2026-09-04T09:30:00+00:00", "status": "scheduled", "deleted_at": None},
    ]
    assert events_overlap(candidate, existing)["id"] == "active"


def test_recurrence_horizon_is_bounded():
    with pytest.raises(ValidationError):
        EventCreate(
            title="Chuỗi quá dài",
            start_time="2026-08-21T08:00:00+07:00",
            end_time="2026-08-21T09:00:00+07:00",
            recurrence_rule="daily",
            recurrence_end=date(2032, 1, 1),
        )


def test_all_day_event_preserves_submitted_local_dates():
    event = EventCreate(
        title="Ngày thi",
        start_time="2026-08-21T00:00:00-04:00",
        end_time="2026-08-22T00:00:00-04:00",
        all_day=True,
    )
    assert event.all_day_start == date(2026, 8, 21)
    assert event.all_day_end == date(2026, 8, 22)


def test_all_day_event_preserves_stored_dates_after_utc_normalization():
    event = EventCreate(
        title="Ngày thi",
        start_time="2026-08-20T17:00:00+00:00",
        end_time="2026-08-21T17:00:00+00:00",
        all_day=True,
        all_day_start=date(2026, 8, 21),
        all_day_end=date(2026, 8, 22),
    )
    assert event.all_day_start == date(2026, 8, 21)
    assert event.all_day_end == date(2026, 8, 22)
