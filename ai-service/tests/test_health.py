"""
Tests for GET /health endpoint.
"""

from fastapi.testclient import TestClient


def test_get_health_status_ok(client: TestClient):
    """Verify that GET /health returns 200 OK and valid status."""
    response = client.get("/health")
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "crop-health-ai"
    assert "model" in data
    assert data["model"]["status"] == "mock"
    assert data["model"]["name"] == "mock-crop-health-model"
    assert data["model"]["version"] == "0.1.0"
