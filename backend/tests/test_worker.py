import pytest

from core.models import AuditLog
from work_orders import provider
from work_orders.models import NotificationLog
from work_orders.tasks import attempt_notification, notify_technician
from tests.conftest import assign_payload, client_for, make_assigned, make_order

pytestmark = pytest.mark.django_db


@pytest.fixture
def order(world):
    return make_assigned(world.org_a, world.disp_a, world.tech_a)


@pytest.fixture
def provider_calls(monkeypatch):
    """Counts what actually reaches the (mock) provider: the externally visible side effect."""
    calls, real = [], provider.send
    monkeypatch.setattr(provider, "send", lambda **kw: (calls.append(kw), real(**kw))[1])
    return calls


def mode(monkeypatch, value):
    monkeypatch.setattr(provider, "get_mode", lambda: value)


def run(order, world, **kw):
    return attempt_notification(order.pk, world.tech_a.pk, "v1", **kw)


def test_success_is_recorded_and_audited(world, order, monkeypatch, provider_calls):
    mode(monkeypatch, "success")
    assert run(order, world) == "sent"
    log = NotificationLog.objects.get()
    assert (log.status, log.attempts) == ("sent", 1)
    assert AuditLog.objects.filter(action="notification.sent", actor=None, target_id=order.pk).count() == 1
    assert len(provider_calls) == 1


def test_temporary_failures_retry_then_give_up_after_max_retries(world, order, monkeypatch):
    mode(monkeypatch, "temporary")
    outcomes = [run(order, world, retries=i, max_retries=3) for i in range(4)]
    assert outcomes == ["retry", "retry", "retry", "failed_exhausted"]
    log = NotificationLog.objects.get()
    assert (log.status, log.attempts) == ("failed_exhausted", 4) and "timeout" in log.last_error
    assert AuditLog.objects.filter(action="notification.failed").count() == 1  # only the final outcome is audited


def test_provider_recovering_mid_retries_ends_in_sent(world, order, monkeypatch):
    mode(monkeypatch, "temporary")
    assert run(order, world, retries=0) == "retry"
    mode(monkeypatch, "success")
    assert run(order, world, retries=1) == "sent"
    log = NotificationLog.objects.get()
    assert (log.status, log.attempts, log.last_error) == ("sent", 2, "")


def test_permanent_failure_is_never_retried(world, order, monkeypatch, provider_calls):
    mode(monkeypatch, "permanent")
    assert run(order, world) == "failed_permanent"
    assert run(order, world, retries=1) == "skipped_duplicate"  # even if the queue redelivers it
    log = NotificationLog.objects.get()
    assert (log.status, log.attempts) == ("failed_permanent", 1)
    assert len(provider_calls) == 1


def test_duplicate_delivery_sends_only_one_notification(world, order, monkeypatch, provider_calls):
    mode(monkeypatch, "success")
    assert run(order, world) == "sent"
    assert run(order, world) == "skipped_duplicate"
    assert NotificationLog.objects.count() == 1 and len(provider_calls) == 1


def test_reassignment_creates_a_new_notification_but_same_version_does_not(world, order, monkeypatch, provider_calls):
    mode(monkeypatch, "success")
    attempt_notification(order.pk, world.tech_a.pk, "v1")
    attempt_notification(order.pk, world.tech_a.pk, "v1")
    attempt_notification(order.pk, world.tech_a.pk, "v2")
    assert len(provider_calls) == 2


def test_stale_assignment_is_skipped(world, order, monkeypatch, provider_calls):
    mode(monkeypatch, "success")
    assert attempt_notification(order.pk, world.tech_a2.pk, "v1") == "stale_assignment"  # order belongs to tech_a now
    assert provider_calls == [] and NotificationLog.objects.get().status == "skipped"


def test_invalid_job_is_dropped_without_retry(world, monkeypatch, provider_calls):
    mode(monkeypatch, "success")
    assert attempt_notification(999999, world.tech_a.pk, "v1") == "invalid_job"
    assert NotificationLog.objects.count() == 0 and provider_calls == []


def test_celery_task_wrapper_stops_on_permanent_failure(world, order, monkeypatch):
    mode(monkeypatch, "permanent")
    result = notify_technician.apply(args=(order.pk, world.tech_a.pk, "v1"))
    assert result.result == "failed_permanent"
    assert NotificationLog.objects.get().attempts == 1


@pytest.mark.django_db(transaction=True)
def test_assigning_enqueues_exactly_one_notification(world, monkeypatch, provider_calls):
    mode(monkeypatch, "success")
    order = make_order(world.org_a, world.disp_a)
    r = client_for(world.disp_a).patch(f"/api/work-orders/{order.pk}/assign/", assign_payload(world.tech_a))
    assert r.status_code == 200
    assert NotificationLog.objects.get().status == "sent"  # ran after commit (eager mode in tests)
    assert len(provider_calls) == 1


@pytest.mark.django_db(transaction=True)
def test_rejected_assignment_sends_no_notification(world, monkeypatch, provider_calls):
    mode(monkeypatch, "success")
    make_assigned(world.org_a, world.disp_a, world.tech_a, start_hours=0, length=3)
    clash = make_order(world.org_a, world.disp_a)
    r = client_for(world.disp_a).patch(f"/api/work-orders/{clash.pk}/assign/", assign_payload(world.tech_a, start_hours=1))
    assert r.status_code == 409
    assert provider_calls == [] and NotificationLog.objects.count() == 0  # rolled back => nothing enqueued
