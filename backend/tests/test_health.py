from fastapi.testclient import TestClient

from main import app


def test_health_endpoint():
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_security_headers_and_readiness_endpoint():
    client = TestClient(app)
    health = client.get("/health", headers={"X-Request-ID": "test-request"})
    assert health.headers["X-Request-ID"] == "test-request"
    assert health.headers["X-Content-Type-Options"] == "nosniff"
    assert health.headers["X-Frame-Options"] == "DENY"

    ready = client.get("/ready")
    assert ready.status_code in {200, 503}
    assert ready.json()["status"] in {"ready", "not_ready"}
