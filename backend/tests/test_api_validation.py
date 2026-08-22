from uuid import uuid4
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from db.auth import get_current_user_id
from db.supabase_client import get_supabase
from main import app


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user_id] = lambda: uuid4()
    app.dependency_overrides[get_supabase] = lambda: object()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_events_reject_naive_query_boundaries(client):
    response = client.get(
        "/api/events",
        params={"start": "2026-08-21T00:00:00", "end": "2026-08-22T00:00:00"},
    )
    assert response.status_code == 422
    assert "múi giờ" in response.json()["detail"]


def test_events_reject_oversized_query_range(client):
    response = client.get(
        "/api/events",
        params={
            "start": "2026-01-01T00:00:00+07:00",
            "end": "2028-01-01T00:00:00+07:00",
        },
    )
    assert response.status_code == 422


def test_profile_rejects_unknown_timezone_before_database(client):
    response = client.patch("/api/profile", json={"timezone": "Not/A_Real_Zone"})
    assert response.status_code == 422


def test_profile_rejects_empty_patch(client):
    response = client.patch("/api/profile", json={})
    assert response.status_code == 400


def test_profile_rejects_null_required_setting_before_database(client):
    response = client.patch("/api/profile", json={"timezone": None})
    assert response.status_code == 422


def test_tasks_reject_null_required_field_before_database(client):
    response = client.patch(f"/api/tasks/{uuid4()}", json={"title": None})
    assert response.status_code == 422


class ExistingEventClient:
    def __init__(self):
        self.data = [{
            "id": str(uuid4()), "user_id": str(uuid4()), "title": "Ôn tập",
            "description": None, "start_time": "2026-08-21T08:00:00+00:00",
            "end_time": "2026-08-21T09:00:00+00:00", "color": "#d93662",
            "category": "Học tập", "status": "scheduled", "is_ai_generated": False,
            "all_day": False, "all_day_start": None, "all_day_end": None,
            "recurrence_rule": None, "recurrence_end": None, "deleted_at": None,
        }]

    def table(self, _name): return self
    def select(self, *_args): return self
    def eq(self, *_args): return self
    def is_(self, *_args): return self
    def limit(self, *_args): return self
    def execute(self): return SimpleNamespace(data=self.data)


def test_event_update_maps_effective_model_error_to_422(client):
    event_id = uuid4()
    app.dependency_overrides[get_supabase] = lambda: ExistingEventClient()
    response = client.patch(f"/api/events/{event_id}", json={"start_time": None})
    assert response.status_code == 422
    assert "không hợp lệ" in response.json()["detail"]
