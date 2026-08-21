from datetime import datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4
from zoneinfo import ZoneInfo

from agent.tools import CalendarTools


class FakeQuery:
    def __init__(self, table_name, database):
        self.table_name = table_name
        self.database = database
        self.inserted = None

    def select(self, *_args, **_kwargs): return self
    def eq(self, *_args, **_kwargs): return self
    def is_(self, *_args, **_kwargs): return self
    def lt(self, *_args, **_kwargs): return self
    def or_(self, *_args, **_kwargs): return self
    def order(self, *_args, **_kwargs): return self
    def limit(self, *_args, **_kwargs): return self

    def insert(self, rows):
        self.inserted = rows
        return self

    def execute(self):
        if self.inserted is not None:
            rows = self.inserted if isinstance(self.inserted, list) else [self.inserted]
            return SimpleNamespace(
                data=[{**row, "id": str(uuid4())} for row in rows]
            )
        return SimpleNamespace(data=self.database.get(self.table_name, []))


class FakeSupabase:
    def __init__(self):
        self.database = {
            "profiles": [
                {
                    "timezone": "Asia/Ho_Chi_Minh",
                    "day_start": "07:00:00",
                    "day_end": "08:00:00",
                }
            ],
            "events": [],
        }

    def table(self, name):
        return FakeQuery(name, self.database)

    def rpc(self, name, params):
        assert name == "create_calendar_events_atomic"
        rows = params["p_events"]
        return SimpleNamespace(execute=lambda: SimpleNamespace(
            data=[{**row, "id": str(uuid4())} for row in rows]
        ))


def test_auto_plan_returns_partial_plan_metadata():
    client = FakeSupabase()
    tools = CalendarTools(client, uuid4(), "Asia/Ho_Chi_Minh")
    today = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date()
    result = tools.auto_plan_study_sessions(
        "Toán",
        (today + timedelta(days=2)).isoformat(),
        total_hours=3,
        session_duration=60,
    )
    assert result["complete"] is False
    assert result["requested_minutes"] == 180
    assert result["planned_minutes"] == 120
    assert result["remaining_minutes"] == 60
    assert "còn thiếu 60 phút" in tools.actions[-1]["label"]
