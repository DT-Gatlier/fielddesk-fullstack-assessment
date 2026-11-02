import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from work_orders.models import WorkOrder
from tests.conftest import assign_payload, client_for, make_assigned, make_order

pytestmark = pytest.mark.django_db
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def test_other_org_work_order_is_invisible_everywhere(world):
    secret = make_order(world.org_b, world.disp_b, title="B-ONLY")
    c = client_for(world.disp_a)
    base = f"/api/work-orders/{secret.pk}/"
    assert c.get(base).status_code == 404
    assert c.patch(base, {"title": "hacked"}).status_code == 404
    assert c.get(base + "activity/").status_code == 404
    assert c.get(base + "attachments/").status_code == 404
    assert c.patch(base + "status/", {"status": "cancelled"}).status_code == 404
    assert c.patch(base + "assign/", assign_payload(world.tech_a)).status_code == 404
    assert c.post(base + "attachments/", {"file": SimpleUploadedFile("a.png", PNG)}, format="multipart").status_code == 404
    secret.refresh_from_db()
    assert secret.title == "B-ONLY"
    assert "B-ONLY" not in str(c.get("/api/work-orders/").data)


def test_list_search_and_dashboard_only_show_own_org(world):
    make_order(world.org_a, world.disp_a, title="mine")
    make_order(world.org_b, world.disp_b, title="theirs")
    c = client_for(world.disp_a)
    assert c.get("/api/work-orders/").data["count"] == 1
    assert c.get("/api/work-orders/?search=theirs").data["count"] == 0
    assert c.get("/api/dashboard/").data["total"] == 1


def test_client_supplied_organisation_or_creator_is_ignored_on_create(world):
    r = client_for(world.disp_a).post("/api/work-orders/", {
        "title": "t", "site_name": "s", "priority": "low", "organization": world.org_b.pk,
        "created_by": world.disp_b.pk, "status": "completed", "reference": "HACK"})
    assert r.status_code == 201
    wo = WorkOrder.objects.get(pk=r.data["id"])
    assert wo.organization_id == world.org_a.pk and wo.created_by_id == world.disp_a.pk
    assert wo.status == "open" and wo.reference != "HACK"


def test_cannot_move_order_to_another_org_via_patch(world):
    order = make_order(world.org_a, world.disp_a)
    client_for(world.disp_a).patch(f"/api/work-orders/{order.pk}/", {"organization": world.org_b.pk})
    order.refresh_from_db()
    assert order.organization_id == world.org_a.pk


def test_cannot_assign_technician_from_another_org(world):
    order = make_order(world.org_a, world.disp_a)
    r = client_for(world.disp_a).patch(f"/api/work-orders/{order.pk}/assign/", assign_payload(world.tech_b))
    assert r.status_code == 400 and "technician" in r.data["error"]["details"]


def test_technician_lists_exclude_other_orgs_and_users_endpoint_is_scoped(world):
    ids = [t["id"] for t in client_for(world.disp_a).get("/api/technicians/").data]
    assert world.tech_b.pk not in ids and world.tech_a.pk in ids
    assert client_for(world.owner_a).patch(f"/api/users/{world.tech_b.pk}/", {"role": "owner"}).status_code == 404
    assert client_for(world.owner_a).get(f"/api/users/{world.tech_b.pk}/").status_code == 404


def test_technician_cannot_report_events_for_other_orgs_order(world):
    other = make_assigned(world.org_b, world.disp_b, world.tech_b)
    from django.utils import timezone
    r = client_for(world.tech_a).post("/api/events/", {
        "eventId": "evt-x1", "workOrderId": other.pk, "type": "status_changed",
        "occurredAt": timezone.now().isoformat(), "payload": {"status": "in_progress"}})
    assert r.status_code == 404
