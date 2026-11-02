import logging
import random

from celery import shared_task
from django.conf import settings
from django.db import transaction

from accounts.models import User
from core.models import audit
from core.realtime import publish_on_commit

from . import provider
from .models import NotificationLog, WorkOrder

logger = logging.getLogger("fielddesk.worker")
FINAL = {"sent", "failed_permanent", "failed_exhausted", "skipped"}


def backoff_seconds(retries):
    base = min(300, 5 * 2**retries)  # 5s, 10s, 20s, 40s ... capped at 5 min
    return base + random.uniform(0, base * 0.2)  # jitter avoids synchronized retry storms


def attempt_notification(work_order_id, technician_id, version, *, retries=0, max_retries=5):
    """One delivery attempt. Returns: sent | retry | failed_permanent | failed_exhausted | skipped_duplicate |
    stale_assignment | invalid_job. Kept separate from the Celery wrapper so it is easy to test."""
    ctx = {"work_order_id": work_order_id, "technician_id": technician_id, "attempt": retries + 1}
    wo = WorkOrder.objects.filter(pk=work_order_id).first()
    tech = User.objects.filter(pk=technician_id, is_active=True).first()
    if wo is None or tech is None:
        logger.error("invalid notification job, not retrying", extra=ctx)  # permanent: nothing to retry against
        return "invalid_job"

    key = f"notify:{work_order_id}:{technician_id}:{version}"  # one notification per assignment version
    NotificationLog.objects.get_or_create(
        dedupe_key=key, defaults={"organization_id": wo.organization_id, "work_order": wo, "technician": tech})

    outcome = "sent"
    with transaction.atomic():
        log = NotificationLog.objects.select_for_update().get(dedupe_key=key)  # concurrent duplicates queue up here
        if log.status in FINAL:
            logger.info("duplicate delivery ignored", extra=ctx)
            return "skipped_duplicate"
        if wo.technician_id != technician_id:
            log.status, log.last_error = "skipped", "assignment changed before delivery"
            log.save()
            logger.info("stale assignment, notification skipped", extra=ctx)
            return "stale_assignment"
        log.attempts += 1
        try:
            provider.send(technician_id=technician_id, work_order_id=work_order_id, idempotency_key=key)
            log.status, log.last_error = "sent", ""
        except provider.PermanentProviderError as exc:
            log.status, log.last_error, outcome = "failed_permanent", str(exc)[:300], "failed_permanent"
        except provider.TemporaryProviderError as exc:
            log.last_error = str(exc)[:300]
            if retries >= max_retries:
                log.status, outcome = "failed_exhausted", "failed_exhausted"
            else:
                log.status, outcome = "retrying", "retry"
        log.save()
        if log.status in FINAL:
            audit(wo.organization_id, None, "notification.sent" if log.status == "sent" else "notification.failed",
                  "work_order", wo.pk, None, {"status": log.status, "attempts": log.attempts, "error": log.last_error})
            publish_on_commit(wo.organization_id, "work_order.updated", id=wo.pk, status=wo.status)
    logger.log(logging.INFO if outcome == "sent" else logging.WARNING, f"notification {outcome}",
               extra={**ctx, "outcome": outcome, "attempts": log.attempts})
    return outcome


@shared_task(bind=True, max_retries=settings.NOTIFY_MAX_RETRIES, name="work_orders.notify_technician")
def notify_technician(self, work_order_id, technician_id, version):
    outcome = attempt_notification(work_order_id, technician_id, version,
                                   retries=self.request.retries, max_retries=self.max_retries)
    if outcome == "retry":  # attempt + error are already committed; now schedule the next try with backoff
        raise self.retry(countdown=backoff_seconds(self.request.retries))
    return outcome
