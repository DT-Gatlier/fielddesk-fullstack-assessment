import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from accounts.models import User
from core.models import AuditLog
from tests.conftest import PASSWORD, assign_payload, client_for, make_assigned, make_order

pytestmark = pytest.mark.django_db
NEW_ORDER = {"title": "Replace valve", "priority": "high", "site_name": "Plant 1"}


def test_unauthenticated_gets_401():
    assert APIClient().post("/api/work-orders/", NEW_ORDER).status_code == 401


def test_technician_cannot_create_edit_assign_export_or_manage_users(world):
    order = make_assigned(world.org_a, world.disp_a, world.tech_a)
    c = client_for(world.tech_a)
    assert c.post("/api/work-orders/", NEW_ORDER).status_code == 403
    assert c.patch(f"/api/work-orders/{order.pk}/", {"title": "x"}).status_code == 403
    assert c.patch(f"/api/work-orders/{order.pk}/assign/", assign_payload(world.tech_a)).status_code == 403
    assert c.patch(f"/api/work-orders/{order.pk}/status/", {"status": "cancelled"}).status_code == 403
    assert c.get("/api/work-orders/export/").status_code == 403
    assert c.get("/api/users/").status_code == 403
    assert c.get("/api/technicians/").status_code == 403


def test_dispatcher_can_create_but_not_manage_users(world):
    c = client_for(world.disp_a)
    assert c.post("/api/work-orders/", NEW_ORDER).status_code == 201
    assert c.post("/api/users/", {"username": "x", "email": "x@x.test", "password": PASSWORD, "role": "owner"}).status_code == 403
    assert c.patch(f"/api/users/{world.tech_a.pk}/", {"role": "owner"}).status_code == 403


def test_owner_creates_user_in_own_org_even_if_payload_claims_another(world):
    r = client_for(world.owner_a).post("/api/users/", {
        "username": "new_tech", "email": "new@example.test", "password": PASSWORD, "role": "technician",
        "organization": world.org_b.pk})
    assert r.status_code == 201 and "password" not in r.data
    assert User.objects.get(username="new_tech").organization_id == world.org_a.pk


def test_role_change_is_audited_and_effective_immediately(world):
    c = client_for(world.owner_a)
    assert c.patch(f"/api/users/{world.tech_a.pk}/", {"role": "dispatcher"}).status_code == 200
    log = AuditLog.objects.get(action="user.role_changed")
    assert log.before == {"role": "technician"} and log.after == {"role": "dispatcher"} and log.actor == world.owner_a
    world.tech_a.refresh_from_db()
    assert client_for(world.tech_a).post("/api/work-orders/", NEW_ORDER).status_code == 201  # role read from DB, not token


def test_owner_cannot_demote_or_deactivate_self(world):
    c = client_for(world.owner_a)
    assert c.patch(f"/api/users/{world.owner_a.pk}/", {"role": "technician"}).status_code == 400
    assert c.patch(f"/api/users/{world.owner_a.pk}/", {"is_active": False}).status_code == 400


def test_technician_only_sees_assigned_orders(world):
    make_assigned(world.org_a, world.disp_a, world.tech_a)
    make_order(world.org_a, world.disp_a)
    r = client_for(world.tech_a).get("/api/work-orders/")
    assert r.status_code == 200 and r.data["count"] == 1
    assert client_for(world.tech_a).get("/api/dashboard/").data["total"] == 1
    assert client_for(world.disp_a).get("/api/dashboard/").data["total"] == 2


def test_owner_manages_users_but_cannot_run_work_orders(world):
    """Brief: owner = users and organisation settings; dispatcher = create/schedule/assign/update work orders."""
    order = make_order(world.org_a, world.disp_a)
    c = client_for(world.owner_a)
    base = f"/api/work-orders/{order.pk}/"
    png = SimpleUploadedFile("a.png", b"\x89PNG\r\n\x1a\n" + b"0" * 32, content_type="image/png")
    assert c.post("/api/work-orders/", NEW_ORDER).status_code == 403
    assert c.patch(base, {"title": "x"}).status_code == 403
    assert c.patch(base + "assign/", assign_payload(world.tech_a)).status_code == 403
    assert c.patch(base + "status/", {"status": "cancelled"}).status_code == 403
    assert c.post(base + "attachments/", {"file": png}, format="multipart").status_code == 403
    assert c.get("/api/technicians/").status_code == 403
    # ...but the owner can see everything in the organisation and use reporting
    assert c.get("/api/work-orders/").data["count"] == 1
    assert c.get(base).status_code == 200 and c.get(base + "activity/").status_code == 200
    assert c.get("/api/dashboard/").data["total"] == 1
    assert c.get("/api/work-orders/export/").status_code == 200
    # and the owner's own job works
    assert c.get("/api/users/").status_code == 200
    assert c.patch("/api/organization/", {"name": "Acme Renamed"}).status_code == 200
    assert client_for(world.disp_a).patch("/api/organization/", {"name": "Hacked"}).status_code == 403
