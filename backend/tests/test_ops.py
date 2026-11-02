import pytest
from rest_framework.test import APIClient

from tests.conftest import client_for

pytestmark = pytest.mark.django_db


def test_health_and_readiness():
    c = APIClient()
    assert c.get("/health").json() == {"status": "ok"}
    r = c.get("/ready")
    assert r.status_code == 200 and r.json()["checks"] == {"database": "ok", "redis": "ok"}


def test_errors_use_one_consistent_shape_with_request_id(world):
    r = client_for(world.disp_a).get("/api/work-orders/999999/", HTTP_X_REQUEST_ID="trace-12345678")
    assert r.status_code == 404
    err = r.json()["error"]
    assert set(err) == {"code", "message", "details", "request_id"}
    assert err["code"] == "not_found" and err["request_id"] == "trace-12345678"
    assert r["X-Request-ID"] == "trace-12345678"


def test_request_id_is_generated_and_malicious_ids_are_replaced():
    r = APIClient().get("/api/me/")
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthenticated"
    assert len(r["X-Request-ID"]) == 32
    bad = APIClient().get("/health", HTTP_X_REQUEST_ID="bad id\nwith newline")
    assert bad["X-Request-ID"] != "bad id\nwith newline"


def test_validation_errors_share_the_same_envelope(world):
    r = client_for(world.disp_a).post("/api/work-orders/", {})
    err = r.json()["error"]
    assert r.status_code == 400 and err["code"] == "validation_error" and "title" in err["details"]
