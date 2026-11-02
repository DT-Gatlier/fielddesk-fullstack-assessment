import pytest

from core.models import AuditLog
from work_orders.models import WorkOrder
from tests.conftest import assign_payload, client_for, make_order, window

pytestmark = pytest.mark.django_db
VALID = {"title": "Replace valve", "priority": "high", "site_name": "Plant 1", "description": "Leaking"}


def test_create_sets_defaults_and_writes_audit(world):
    r = client_for(world.disp_a).post("/api/work-orders/", VALID)
    assert r.status_code == 201
    assert r.data["reference"].startswith("WO-") and r.data["status"] == "open" and r.data["technician"] is None
    log = AuditLog.objects.get(action="work_order.created")
    assert log.target_id == r.data["id"] and log.actor == world.disp_a and log.organization == world.org_a


@pytest.mark.parametrize("patch,field", [
    ({"title": ""}, "title"), ({"title": "   "}, "title"), ({"priority": "asap"}, "priority"),
    ({"site_name": ""}, "site_name"), ({"title": "x" * 201}, "title"),
])
def test_create_validation(world, patch, field):
    r = client_for(world.disp_a).post("/api/work-orders/", {**VALID, **patch})
    assert r.status_code == 400
    assert field in r.data["error"]["details"]
    assert r.data["error"]["code"] == "validation_error"
    assert not WorkOrder.objects.exists()


def test_edit_audits_before_and_after(world):
    order = make_order(world.org_a, world.disp_a, title="old")
    assert client_for(world.disp_a).patch(f"/api/work-orders/{order.pk}/", {"title": "new"}).status_code == 200
    log = AuditLog.objects.get(action="work_order.updated")
    assert log.before["title"] == "old" and log.after["title"] == "new"


def test_assignment_window_validation(world):
    order = make_order(world.org_a, world.disp_a)
    c = client_for(world.disp_a)
    url = f"/api/work-orders/{order.pk}/assign/"
    start, end = window(0)
    assert c.patch(url, {"technician": world.tech_a.pk, "start_at": end, "end_at": start}).status_code == 400  # end < start
    assert c.patch(url, {"technician": world.tech_a.pk, "start_at": start, "end_at": start}).status_code == 400  # zero length
    long_start, long_end = window(0, 30)
    assert c.patch(url, {"technician": world.tech_a.pk, "start_at": long_start, "end_at": long_end}).status_code == 400
    assert c.patch(url, {"technician": world.owner_a.pk, **dict(zip(("start_at", "end_at"), window(0)))}).status_code == 400  # not a technician
    assert c.patch(url, {"technician": 999999, "start_at": start, "end_at": end}).status_code == 400
    order.refresh_from_db()
    assert order.technician_id is None


def test_assign_records_audit_with_before_and_after(world):
    order = make_order(world.org_a, world.disp_a)
    assert client_for(world.disp_a).patch(f"/api/work-orders/{order.pk}/assign/", assign_payload(world.tech_a)).status_code == 200
    log = AuditLog.objects.get(action="work_order.assigned")
    assert log.before["technician"] is None and log.after["technician"] == world.tech_a.pk


def test_filters_search_sorting_and_pagination(world):
    for i in range(25):
        make_order(world.org_a, world.disp_a, title=f"Pump {i:02d}", priority="low" if i % 2 else "urgent",
                   status="open" if i < 20 else "completed")
    make_order(world.org_a, world.disp_a, title="Boiler check", site_name="Harbour")
    c = client_for(world.disp_a)
    page1 = c.get("/api/work-orders/?ordering=title")
    assert page1.data["count"] == 26 and len(page1.data["results"]) == 20 and page1.data["next"]
    assert len(c.get("/api/work-orders/?ordering=title&page=2").data["results"]) == 6
    assert c.get("/api/work-orders/?status=completed").data["count"] == 5
    assert c.get("/api/work-orders/?search=boiler").data["count"] == 1
    assert c.get("/api/work-orders/?search=harbour").data["count"] == 1
    assert c.get("/api/work-orders/?priority=urgent&status=completed").data["count"] >= 1
    top = c.get("/api/work-orders/?ordering=-priority").data["results"][0]
    assert top["priority"] == "urgent"  # ranked by urgency, not alphabetically


def test_dashboard_counts(world):
    make_order(world.org_a, world.disp_a)
    make_order(world.org_a, world.disp_a)
    make_order(world.org_a, world.disp_a, status="completed")
    assert client_for(world.disp_a).get("/api/dashboard/").data == {"by_status": {"open": 2, "completed": 1}, "total": 3}


def test_manager_status_update_and_activity_history(world):
    order = make_order(world.org_a, world.disp_a)
    c = client_for(world.disp_a)
    assert c.patch(f"/api/work-orders/{order.pk}/status/", {"status": "on_hold"}).data["status"] == "on_hold"
    assert c.patch(f"/api/work-orders/{order.pk}/status/", {"status": "on_hold"}).status_code == 409  # no-op rejected
    assert c.patch(f"/api/work-orders/{order.pk}/status/", {"status": "bogus"}).status_code == 400
    actions = [a["action"] for a in c.get(f"/api/work-orders/{order.pk}/activity/").data]
    assert actions == ["work_order.status_changed"]


def test_api_has_no_way_to_edit_or_delete_audit_or_orders(world):
    order = make_order(world.org_a, world.disp_a)
    c = client_for(world.disp_a)
    assert c.delete(f"/api/work-orders/{order.pk}/").status_code == 405
    assert c.post("/api/audit-logs/", {"action": "x"}).status_code == 405
    assert c.patch("/api/audit-logs/1/", {"action": "x"}).status_code == 405
