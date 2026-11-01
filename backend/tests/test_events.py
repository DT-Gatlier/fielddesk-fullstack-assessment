import threading
from datetime import timedelta

import pytest
from django.db import connections
from django.utils import timezone

from core.models import AuditLog
from work_orders import services
from work_orders.models import ProgressEvent, WorkOrder
from tests.conftest import client_for, make_assigned

URL = "/api/events/"


def body(order, event_id="evt-10001", status="in_progress", **over):
    data = {"eventId": event_id, "workOrderId": order.pk, "type": "status_changed",
            "occurredAt": timezone.now().isoformat(), "payload": {"status": status, "note": "Work started"}}
    return {**data, **over}


@pytest.fixture
def order(world):
    return make_assigned(world.org_a, world.disp_a, world.tech_a)


@pytest.mark.django_db
def test_valid_event_is_stored_and_applied_atomically(world, order):
    r = client_for(world.tech_a).post(URL, body(order))
    assert r.status_code == 201 and r.data == {"eventId": "evt-10001", "status": "accepted"}
    order.refresh_from_db()
    assert order.status == "in_progress"
    event = ProgressEvent.objects.get()
    assert event.payload == {"status": "in_progress", "note": "Work started"} and event.actor == world.tech_a
    assert AuditLog.objects.filter(action="work_order.status_changed", target_id=order.pk).count() == 1


@pytest.mark.django_db
def test_duplicate_event_is_acknowledged_but_not_reapplied(world, order):
    c = client_for(world.tech_a)
    first = body(order)
    assert c.post(URL, first).status_code == 201
    assert c.post(URL, body(order, "evt-2", status="completed")).status_code == 201
    r = c.post(URL, first)  # exact replay of the first request after the order moved on
    assert r.status_code == 200 and r.data["status"] == "duplicate"
    order.refresh_from_db()
    assert order.status == "completed"  # NOT reverted to in_progress
    assert ProgressEvent.objects.count() == 2


@pytest.mark.django_db
def test_same_event_id_with_different_body_is_a_conflict(world, order):
    c = client_for(world.tech_a)
    assert c.post(URL, body(order)).status_code == 201
    r = c.post(URL, body(order, status="on_hold"))
    assert r.status_code == 409 and r.data["error"]["code"] == "event_id_conflict"
    assert ProgressEvent.objects.count() == 1


@pytest.mark.django_db(transaction=True)
def test_simultaneous_duplicate_submissions_apply_once(world, order):
    n = 5
    barrier = threading.Barrier(n)
    results, errors = [], []
    payload = body(order)

    def submit():
        try:
            client = client_for(world.tech_a)
            barrier.wait(timeout=10)
            results.append(client.post(URL, payload).status_code)
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)
        finally:
            connections.close_all()

    threads = [threading.Thread(target=submit) for _ in range(n)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert not errors
    assert sorted(results) == [200] * (n - 1) + [201]
    assert ProgressEvent.objects.count() == 1
    assert AuditLog.objects.filter(action="work_order.status_changed").count() == 1


@pytest.mark.django_db
def test_failure_after_insert_rolls_back_event_and_order_change(world, order, monkeypatch):
    def boom(*args, **kwargs):
        wo = args[0]
        wo.status = "in_progress"
        wo.save(update_fields=["status"])  # a partial change that must disappear
        raise RuntimeError("simulated crash")

    monkeypatch.setattr(services, "apply_status_change", boom)
    data = {**body(order), "occurredAt": timezone.now()}
    with pytest.raises(RuntimeError):
        services.process_progress_event(user=world.tech_a, data=data)
    order.refresh_from_db()
    assert order.status == "open"
    assert ProgressEvent.objects.count() == 0
    assert AuditLog.objects.count() == 0


@pytest.mark.django_db
def test_invalid_transition_is_rejected_and_leaves_no_trace(world, order):
    r = client_for(world.tech_a).post(URL, body(order, status="completed"))  # open -> completed not allowed
    assert r.status_code == 409 and r.data["error"]["code"] == "invalid_transition"
    assert ProgressEvent.objects.count() == 0
    assert WorkOrder.objects.get(pk=order.pk).status == "open"


@pytest.mark.django_db
@pytest.mark.parametrize("override", [
    {"type": "explode"},
    {"eventId": "has spaces"},
    {"eventId": ""},
    {"occurredAt": "not-a-date"},
    {"occurredAt": (timezone.now() + timedelta(days=1)).isoformat()},
    {"occurredAt": (timezone.now() - timedelta(days=30)).isoformat()},
    {"payload": {"status": "teleported"}},
    {"payload": {"status": "in_progress", "evil": "x"}},
    {"payload": {"status": "in_progress", "note": "x" * 501}},
    {"payload": "nope"},
    {"workOrderId": "abc"},
])
def test_event_validation_rejects_untrusted_input(world, order, override):
    r = client_for(world.tech_a).post(URL, body(order, **override))
    assert r.status_code == 400 and r.data["error"]["code"] == "validation_error"
    assert ProgressEvent.objects.count() == 0


@pytest.mark.django_db
def test_only_the_assigned_technician_may_report(world, order):
    assert client_for(world.tech_a2).post(URL, body(order)).status_code == 404  # other technician, same org
    assert client_for(world.disp_a).post(URL, body(order)).status_code == 403  # dispatchers use the status endpoint
    assert client_for(world.tech_b).post(URL, body(order)).status_code == 404  # other organisation
    assert ProgressEvent.objects.count() == 0


@pytest.mark.django_db
def test_events_cannot_be_modified_or_deleted(world, order):
    client_for(world.tech_a).post(URL, body(order))
    event = ProgressEvent.objects.get()
    event.payload = {"status": "completed"}
    with pytest.raises(RuntimeError):
        event.save()
    with pytest.raises(RuntimeError):
        event.delete()
