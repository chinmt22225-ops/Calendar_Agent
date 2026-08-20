from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Iterable
from zoneinfo import ZoneInfo


def merge_busy_intervals(
    events: Iterable[dict], range_start: datetime, range_end: datetime
) -> list[tuple[datetime, datetime]]:
    intervals: list[tuple[datetime, datetime]] = []
    for event in events:
        start = _as_datetime(event["start_time"])
        end = _as_datetime(event["end_time"])
        if end <= range_start or start >= range_end:
            continue
        intervals.append((max(start, range_start), min(end, range_end)))
    intervals.sort(key=lambda item: item[0])

    merged: list[tuple[datetime, datetime]] = []
    for start, end in intervals:
        if not merged or start > merged[-1][1]:
            merged.append((start, end))
        else:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
    return merged


def find_free_slots(
    events: Iterable[dict],
    target_date: date,
    duration_minutes: int,
    timezone: str = "Asia/Ho_Chi_Minh",
    day_start: time = time(7, 0),
    day_end: time = time(22, 0),
    step_minutes: int = 30,
) -> list[dict[str, str]]:
    if duration_minutes <= 0:
        raise ValueError("duration_minutes phải lớn hơn 0")
    tz = ZoneInfo(timezone)
    range_start = datetime.combine(target_date, day_start, tzinfo=tz)
    range_end = datetime.combine(target_date, day_end, tzinfo=tz)
    busy = merge_busy_intervals(events, range_start, range_end)
    duration = timedelta(minutes=duration_minutes)
    step = timedelta(minutes=step_minutes)
    slots: list[dict[str, str]] = []
    cursor = range_start

    for busy_start, busy_end in busy + [(range_end, range_end)]:
        while cursor + duration <= busy_start:
            slots.append({"start": cursor.isoformat(), "end": (cursor + duration).isoformat()})
            cursor += step
        cursor = max(cursor, busy_end)
    return slots


def distribute_study_sessions(
    events: Iterable[dict],
    subject: str,
    exam_date: date,
    total_hours: float,
    session_duration: int,
    timezone: str = "Asia/Ho_Chi_Minh",
    today: date | None = None,
    day_start: time = time(7, 0),
    day_end: time = time(22, 0),
) -> list[dict]:
    if total_hours <= 0 or session_duration <= 0:
        raise ValueError("Thời lượng học phải lớn hơn 0")
    start_day = today or datetime.now(ZoneInfo(timezone)).date()
    if exam_date <= start_day:
        raise ValueError("Ngày thi phải sau ngày hiện tại")

    remaining = max(1, round(total_hours * 60 / session_duration))
    candidates: list[dict] = []
    day = start_day
    while day < exam_date and remaining > 0:
        slots = find_free_slots(events, day, session_duration, timezone, day_start, day_end)
        if slots:
            preferred = next(
                (slot for slot in slots if 18 <= _as_datetime(slot["start"]).hour <= 20),
                slots[0],
            )
            candidates.append(
                {
                    "title": f"Ôn tập {subject}",
                    "description": f"Buổi học {session_duration} phút do AI sắp xếp.",
                    "start_time": preferred["start"],
                    "end_time": preferred["end"],
                    "category": subject,
                    "color": "#7c3aed",
                    "status": "scheduled",
                    "is_ai_generated": True,
                }
            )
            events = [*events, candidates[-1]]
            remaining -= 1
        day += timedelta(days=1)
    return candidates


def _as_datetime(value: datetime | str) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value.replace("Z", "+00:00"))
