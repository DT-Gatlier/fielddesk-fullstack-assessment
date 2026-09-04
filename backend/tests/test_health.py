import pytest
from fastapi.testclient import TestClient
from app.main import app
from unittest.mock import patch
from sqlalchemy.exc import OperationalError

client = TestClient(app)

def test_ready_endpoint_success():
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}

def test_ready_endpoint_db_failure():
    # Test that /ready returns 503 if DB is down
    with patch("app.main.database.engine.connect") as mock_connect:
        mock_connect.side_effect = OperationalError("mock", "mock", "mock")
        response = client.get("/ready")
        assert response.status_code == 503
        assert response.json() == {"status": "unavailable", "detail": "Database connection failed"}
