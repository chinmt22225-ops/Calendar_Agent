from uuid import uuid4

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
