from types import SimpleNamespace
from uuid import uuid4

from agent.tools import CalendarTools


class TaskQuery:
    def __init__(self, database):
        self.database = database
        self.filters = []
        self.operation = "select"
        self.payload = None
        self.maximum = None

    def select(self, *_args): return self
    def eq(self, key, value): self.filters.append(("eq", key, value)); return self
    def gte(self, key, value): self.filters.append(("gte", key, value)); return self
    def lte(self, key, value): self.filters.append(("lte", key, value)); return self
    def order(self, *_args, **_kwargs): return self
    def limit(self, value): self.maximum = value; return self
    def insert(self, payload): self.operation = "insert"; self.payload = payload; return self
    def update(self, payload): self.operation = "update"; self.payload = payload; return self
    def delete(self): self.operation = "delete"; return self

    def _matches(self, row):
        for operation, key, value in self.filters:
            current = str(row.get(key, ""))
            if operation == "eq" and current != str(value): return False
            if operation == "gte" and current < str(value): return False
            if operation == "lte" and current > str(value): return False
        return True

    def execute(self):
        if self.operation == "insert":
            row = {**self.payload, "id": str(uuid4())}
            self.database.append(row)
            return SimpleNamespace(data=[row])
        matched = [row for row in self.database if self._matches(row)]
        if self.operation == "update":
            for row in matched: row.update(self.payload)
        if self.operation == "delete":
            self.database[:] = [row for row in self.database if row not in matched]
        return SimpleNamespace(data=matched[:self.maximum] if self.maximum else matched)


class TaskClient:
    def __init__(self, rows): self.rows = rows
    def table(self, name):
        assert name == "study_tasks"
        return TaskQuery(self.rows)


def task_tools(rows):
    tools = CalendarTools.__new__(CalendarTools)
    tools.client = TaskClient(rows)
    tools.user_id = "user-1"
    tools.actions = []
    return tools


def test_get_tasks_answers_exact_deadline_and_subject():
    rows = [
        {"id": "a", "user_id": "user-1", "title": "Nộp bài", "subject": "Toán", "deadline": "2026-08-20", "status": "pending"},
        {"id": "b", "user_id": "user-1", "title": "Đọc sách", "subject": "Văn", "deadline": "2026-08-21", "status": "pending"},
        {"id": "c", "user_id": "user-2", "title": "Riêng tư", "subject": "Toán", "deadline": "2026-08-20", "status": "pending"},
    ]
    result = task_tools(rows).get_study_tasks(
        deadline_from="2026-08-20", deadline_to="2026-08-20", subject="toán"
    )
    assert result["count"] == 1
    assert result["tasks"][0]["title"] == "Nộp bài"


def test_create_update_and_delete_task_are_owned_and_audited():
    rows = []
    tools = task_tools(rows)
    created = tools.create_study_task("Ôn chương 3", "Triết", 2, "2026-08-25", 3)
    assert created["user_id"] == "user-1"
    assert tools.actions[-1]["type"] == "task_created"

    updated = tools.update_study_task(created["id"], status="completed")
    assert updated["status"] == "completed"
    assert tools.actions[-1]["type"] == "task_updated"

    deleted = tools.delete_study_task(created["id"])
    assert deleted["deleted"] is True
    assert rows == []
    assert tools.actions[-1]["type"] == "task_deleted"


def test_tool_dispatch_rejects_unknown_or_invalid_calls():
    tools = task_tools([])
    assert "error" in tools.execute_tool("dangerous_unknown_tool", {})
    assert "error" in tools.execute_tool("create_study_task", {"title": "Thiếu dữ liệu"})
