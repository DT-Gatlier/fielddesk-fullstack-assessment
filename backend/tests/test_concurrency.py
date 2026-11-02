import threading

import pytest
from django.db import connections

from work_orders.models import WorkOrder
from tests.conftest import assign_payload, client_for, make_assigned, make_order


def assign(client, order, payload):
    return client.patch(f"/api/work-orders/{order.pk}/assign/", payload)


@pytest.mark.django_db
def test_overlapping_assignment_is_rejected_with_409(world):
    make_assigned(world.org_a, world.disp_a, world.tech_a, start_hours=0, length=3)
    second = make_order(world.org_a, world.disp_a)
    r = assign(client_for(world.disp_a), second, assign_payload(world.tech_a, start_hours=2))
    assert r.status_code == 409
    assert r.data["error"]["code"] == "scheduling_conflict"
    second.refresh_from_db()
    assert second.technician_id is None


@pytest.mark.django_db
def test_back_to_back_windows_and_other_technicians_are_allowed(world):
    make_assigned(world.org_a, world.disp_a, world.tech_a, start_hours=0, length=2)
    c = client_for(world.disp_a)
    adjacent = make_order(world.org_a, world.disp_a)
    assert assign(c, adjacent, assign_payload(world.tech_a, start_hours=2)).status_code == 200  # [) ranges: touching is fine
    other_tech = make_order(world.org_a, world.disp_a)
    assert assign(c, other_tech, assign_payload(world.tech_a2, start_hours=0)).status_code == 200


@pytest.mark.django_db
def test_completed_or_cancelled_orders_free_the_slot(world):
    first = make_assigned(world.org_a, world.disp_a, world.tech_a, start_hours=0)
    c = client_for(world.disp_a)
    second = make_order(world.org_a, world.disp_a)
    assert assign(c, second, assign_payload(world.tech_a, start_hours=0)).status_code == 409
    assert c.patch(f"/api/work-orders/{first.pk}/status/", {"status": "cancelled"}).status_code == 200
    assert assign(c, second, assign_payload(world.tech_a, start_hours=0)).status_code == 200


@pytest.mark.django_db
def test_reopening_an_order_cannot_create_an_overlap(world):
    done = make_assigned(world.org_a, world.disp_a, world.tech_a, start_hours=0, status="completed")
    make_assigned(world.org_a, world.disp_a, world.tech_a, start_hours=1)  # took the freed slot
    r = client_for(world.disp_a).patch(f"/api/work-orders/{done.pk}/status/", {"status": "in_progress"})
    assert r.status_code == 409 and r.data["error"]["code"] == "scheduling_conflict"


@pytest.mark.django_db(transaction=True)
def test_simultaneous_conflicting_assignments_only_one_wins(world):
    """Real threads, real connections, real PostgreSQL: exactly one request may win the technician's slot."""
    n = 6
    orders = [make_order(world.org_a, world.disp_a) for _ in range(n)]
    dispatchers = [world.disp_a, world.disp_a2] * (n // 2)
    barrier = threading.Barrier(n)
    results, errors = [], []

    def attempt(dispatcher, order):
        try:
            client = client_for(dispatcher)
            barrier.wait(timeout=10)  # release all requests at (almost) the same instant
            results.append(assign(client, order, assign_payload(world.tech_a, start_hours=1)).status_code)
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)
        finally:
            connections.close_all()

    threads = [threading.Thread(target=attempt, args=(d, o)) for d, o in zip(dispatchers, orders)]
    [t.start() for t in threads]
    [t.join() for t in threads]

    assert not errors
    assert sorted(results) == [200] + [409] * (n - 1)
    assert WorkOrder.objects.filter(technician=world.tech_a).count() == 1  # the database never held an overlap
