import pytest
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from tests.conftest import PASSWORD

pytestmark = pytest.mark.django_db


def login(client, who, password=PASSWORD):
    return client.post("/api/auth/login/", {"login": who, "password": password})


def test_login_returns_token_and_httponly_refresh_cookie(world):
    client = APIClient()
    r = login(client, "disp_a")
    assert r.status_code == 200
    assert r.data["role"] == "dispatcher" and r.data["access_token"]
    assert client.cookies["refresh_token"]["httponly"]
    assert "refresh" not in r.data  # refresh token is never exposed to JavaScript


def test_login_with_email_and_token_works_against_api(world):
    client = APIClient()
    token = login(client, "disp_a@example.test").data["access_token"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    assert client.get("/api/me/").data["username"] == "disp_a"


def test_wrong_password_and_unknown_user_are_indistinguishable(world):
    a = login(APIClient(), "disp_a", "wrong")
    b = login(APIClient(), "nobody", "wrong")
    assert a.status_code == b.status_code == 401
    assert a.data["error"]["message"] == b.data["error"]["message"]
    assert a.data["error"]["code"] == "authentication_failed" or a.data["error"]["code"] == "unauthenticated"


def test_inactive_user_cannot_log_in(world):
    world.disp_a.is_active = False
    world.disp_a.save()
    assert login(APIClient(), "disp_a").status_code == 401


def test_login_is_rate_limited(world, monkeypatch):
    monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {"login": "5/min", "events": "60/min"})
    client = APIClient()
    assert [login(client, "disp_a", "bad").status_code for _ in range(5)] == [401] * 5
    assert login(client, "disp_a", "bad").status_code == 429


def test_api_requires_authentication():
    assert APIClient().get("/api/work-orders/").status_code == 401
    assert APIClient().get("/api/dashboard/").status_code == 401


def test_refresh_token_rotates_and_cannot_be_reused(world):
    client = APIClient()
    login(client, "disp_a")
    old = client.cookies["refresh_token"].value
    assert client.post("/api/auth/refresh/").status_code == 200
    client.cookies["refresh_token"] = old  # replay the already-used token
    assert client.post("/api/auth/refresh/").status_code == 401


def test_logout_blacklists_refresh_token(world):
    client = APIClient()
    login(client, "disp_a")
    old = client.cookies["refresh_token"].value
    assert client.post("/api/auth/logout/").status_code == 204
    client.cookies["refresh_token"] = old
    assert client.post("/api/auth/refresh/").status_code == 401


def test_passwords_are_stored_hashed(world):
    assert world.disp_a.password != PASSWORD and "$" in world.disp_a.password
