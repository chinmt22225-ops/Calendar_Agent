from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from typing import Iterable, Iterator


MAX_RECURRENCE_DAYS = 366 * 5
MAX_RECURRENCE_OCCURRENCES = 2000


def validate_recurrence_horizon(
    start: datetime,
    rule: str | None,
    recurrence_end: date | None,
) -> None:
    if not rule or not recurrence_end:
        return
    span_days = (recurrence_end - start.date()).days
    if span_days > MAX_RECURRENCE_DAYS:
        raise ValueError(
            f"Sự kiện lặp lại không được kéo dài quá {MAX_RECURRENCE_DAYS} ngày"
        )


def iter_occurrences(
    start: datetime,
    end: datetime,
    rule: str | None,
    recurrence_end: date | None,
) -> Iterator[tuple[datetime, datetime]]:
    """Yield the base event and every recurrence through the inclusive end date."""
    validate_recurrence_horizon(start, rule, recurrence_end)
    yield start, end
    if not rule or not recurrence_end:
        return

    duration = end - start
    cursor = start
    occurrence_count = 1
    while occurrence_count < MAX_RECURRENCE_OCCURRENCES:
        if rule == "daily":
            cursor += timedelta(days=1)
        elif rule == "weekly":
            cursor += timedelta(weeks=1)
        elif rule == "monthly":
            cursor = _next_same_day_of_month(cursor, start.day)
        else:
            return
        if cursor.date() > recurrence_end:
            return
        yield cursor, cursor + duration
        occurrence_count += 1
    raise ValueError(
        f"Sự kiện lặp lại không được vượt quá {MAX_RECURRENCE_OCCURRENCES} lần"
    )


def events_overlap(
    candidate: dict,
    existing: Iterable[dict],
    exclude_id: str | None = None,
) -> dict | None:
    candidate_start = _as_datetime(candidate["start_time"])
    candidate_end = _as_datetime(candidate["end_time"])
    candidate_end_date = _as_date(candidate.get("recurrence_end"))
    validate_recurrence_horizon(
        candidate_start, candidate.get("recurrence_rule"), candidate_end_date
    )

    for event in existing:
        if exclude_id and event.get("id") == exclude_id:
            continue
        if event.get("status") != "scheduled" or event.get("deleted_at"):
            continue
        existing_start = _as_datetime(event["start_time"])
        existing_end = _as_datetime(event["end_time"])
        existing_end_date = _as_date(event.get("recurrence_end"))
        if _occurrences_overlap(
            iter_occurrences(
                candidate_start,
                candidate_end,
                candidate.get("recurrence_rule"),
                candidate_end_date,
            ),
            iter_occurrences(
                existing_start,
                existing_end,
                event.get("recurrence_rule"),
                existing_end_date,
            ),
        ):
            return event
    return None


def _occurrences_overlap(
    left: Iterator[tuple[datetime, datetime]],
    right: Iterator[tuple[datetime, datetime]],
) -> bool:
    """Compare two sorted occurrence streams without materializing either series."""
    left_item = next(left, None)
    right_item = next(right, None)
    while left_item and right_item:
        left_start, left_end = left_item
        right_start, right_end = right_item
        if left_start < right_end and left_end > right_start:
            return True
        if left_end <= right_start:
            left_item = next(left, None)
        else:
            right_item = next(right, None)
    return False


def _next_same_day_of_month(value: datetime, target_day: int) -> datetime:
    year = value.year + (1 if value.month == 12 else 0)
    month = 1 if value.month == 12 else value.month + 1
    while target_day > calendar.monthrange(year, month)[1]:
        year += 1 if month == 12 else 0
        month = 1 if month == 12 else month + 1
    return value.replace(year=year, month=month, day=target_day)


def _as_datetime(value: datetime | str) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _as_date(value: date | str | None) -> date | None:
    if value is None or isinstance(value, date):
        return value
    return date.fromisoformat(value)
