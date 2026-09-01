import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from app.main import app
import os
import uuid

client = TestClient(app)

def test_unused_endpoint_removed():
    # Attempting to fetch a single attachment should return 404 (or 405 if another endpoint matches)
    response = client.get("/attachments/some-uuid")
    assert response.status_code in [404, 405]

def test_delete_attachment_exists():
    # Verify the DELETE endpoint is registered
    response = client.delete("/attachments/some-uuid")
    # If unauthenticated, returns 401. If not found, 404. We just care it exists.
    assert response.status_code != 405
