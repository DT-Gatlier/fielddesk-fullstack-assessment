"""Business operations. Every state change runs inside a transaction together with its audit entry,
and realtime messages are only published after commit."""
import hashlib
import json
import logging
import os
import re
import uuid

from django.conf import settings
from django.core.files.storage import default_storage
from django.db import IntegrityError, transaction
from django.db.models import F
from rest_framework.exceptions import NotFound

from accounts.models import Organization
from core.models import audit
from core.realtime import publish_on_commit

from .exceptions import (EventConflict, FileTooLarge, InvalidTransition, QuotaExceeded, SchedulingConflict,
                         UnsupportedFileType)
from .models import Attachment, ProgressEvent, WorkOrder

logger = logging.getLogger("fielddesk.work_orders")

OVERLAP_SQLSTATE = "23P01"  # exclusion_violation
TRANSITIONS = {  # what a technician may do; managers may set any other status
    "open": {"in_progress"},
    "in_progress": {"completed", "on_hold"},
    "on_hold": {"in_progress"},
    "completed": set(),
    "cancelled": set(),
}
CLOSED = ("completed", "cancelled")


def is_overlap_violation(exc):
    cause = exc.__cause__
    return (getattr(cause, "pgcode", None) or getattr(cause, "sqlstate", None)) == OVERLAP_SQLSTATE


def _announce(wo):
    publish_on_commit(wo.organization_id, "work_order.updated", id=wo.pk, status=wo.status)


# ---------------------------------------------------------------- assignment / scheduling
def assign_work_order(*, order_id, organization, technician, start_at, end_at, actor):
    """Assign + schedule. The database exclusion constraint decides conflicts, so the result is correct no matter how
    many API instances run or how requests interleave. We only translate the violation into a 409."""
    from .tasks import notify_technician  # local import avoids a circular import

    try:
        with transaction.atomic():
            wo = WorkOrder.objects.select_for_update().get(pk=order_id, organization=organization)
            if wo.status in CLOSED:
                raise InvalidTransition("Closed work orders cannot be scheduled.")
            before = {"technician": wo.technician_id, "start_at": wo.start_at, "end_at": wo.end_at}
            wo.technician, wo.start_at, wo.end_at = technician, start_at, end_at
            wo.save(update_fields=["technician", "start_at", "end_at", "updated_at"])  # <- may raise ExclusionViolation
            audit(organization, actor, "work_order.assigned", "work_order", wo.pk, before,
                  {"technician": technician.pk, "start_at": start_at, "end_at": end_at})
            version = wo.updated_at.isoformat()
            transaction.on_commit(lambda: notify_technician.delay(wo.pk, technician.pk, version), robust=True)
            _announce(wo)
    except IntegrityError as exc:
        if is_overlap_violation(exc):
            raise SchedulingConflict() from exc
        raise
    return wo


# ---------------------------------------------------------------- status changes
def apply_status_change(wo, new_status, actor, *, technician_rules):
    """Runs inside the caller's transaction on a row-locked work order."""
    old = wo.status
    if new_status == old:
        raise InvalidTransition("The work order already has that status.")
    if technician_rules and new_status not in TRANSITIONS.get(old, set()):
        raise InvalidTransition(f"Cannot change status from '{old}' to '{new_status}'.")
    wo.status = new_status
    wo.save(update_fields=["status", "updated_at"])
    audit(wo.organization_id, actor, "work_order.status_changed", "work_order", wo.pk, {"status": old}, {"status": new_status})
    _announce(wo)


def set_status(*, order_id, organization, new_status, actor):
    try:
        with transaction.atomic():
            wo = WorkOrder.objects.select_for_update().get(pk=order_id, organization=organization)
            apply_status_change(wo, new_status, actor, technician_rules=False)
    except IntegrityError as exc:  # re-opening an order can collide with another active order of the technician
        if is_overlap_violation(exc):
            raise SchedulingConflict() from exc
        raise
    return wo


# ---------------------------------------------------------------- progress events (idempotent)
def _fingerprint(data):
    body = {"workOrderId": data["workOrderId"], "type": data["type"],
            "occurredAt": data["occurredAt"].isoformat(), "payload": data["payload"]}
    return hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()


def process_progress_event(*, user, data):
    """One transaction covers: lock work order -> insert audit record -> apply change.

    * Idempotency: UNIQUE(organization, event_id). Concurrent duplicates serialise on the work-order row lock and
      the unique index; the loser finds the stored event and returns it without applying anything again.
    * Atomicity: any exception after the insert rolls back the event record and the work-order change together.
    Returns (event, created).
    """
    fingerprint = _fingerprint(data)
    with transaction.atomic():
        wo = (WorkOrder.objects.select_for_update()
              .filter(pk=data["workOrderId"], organization_id=user.organization_id, technician_id=user.pk).first())
        if wo is None:
            raise NotFound("Work order not found.")  # same answer for 'other org' and 'not assigned to you'
        try:
            with transaction.atomic():  # savepoint: a unique violation must not poison the outer transaction
                event = ProgressEvent.objects.create(
                    organization_id=user.organization_id, event_id=data["eventId"], work_order=wo, actor=user,
                    type=data["type"], occurred_at=data["occurredAt"], payload=data["payload"], payload_hash=fingerprint)
        except IntegrityError:
            existing = ProgressEvent.objects.get(organization_id=user.organization_id, event_id=data["eventId"])
            if existing.payload_hash != fingerprint:
                raise EventConflict() from None
            return existing, False
        if data["type"] == "status_changed":
            apply_status_change(wo, data["payload"]["status"], user, technician_rules=True)
        else:
            audit(wo.organization_id, user, "work_order.note_added", "work_order", wo.pk, None, {"note": data["payload"].get("note")})
            _announce(wo)
        return event, True


# ---------------------------------------------------------------- attachments
SIGNATURES = (
    ("image/png", b"\x89PNG\r\n\x1a\n"),
    ("image/jpeg", b"\xff\xd8\xff"),
    ("application/pdf", b"%PDF-"),
)


def sniff_content_type(f):
    head = f.read(16)
    f.seek(0)
    return next((ctype for ctype, magic in SIGNATURES if head.startswith(magic)), None)


def store_attachment(*, user, work_order, upload):
    if upload.size > settings.MAX_UPLOAD_BYTES:
        raise FileTooLarge()
    content_type = sniff_content_type(upload)  # trust the bytes, not the filename or the Content-Type header
    if content_type is None:
        raise UnsupportedFileType()
    display_name = re.sub(r"[\x00-\x1f]", "", os.path.basename(upload.name or "file"))[:100] or "file"
    with transaction.atomic():
        org = Organization.objects.select_for_update().get(pk=user.organization_id)  # serialises quota checks per org
        if org.storage_used + upload.size > org.storage_limit:
            raise QuotaExceeded()
        key = f"{org.pk}/{uuid.uuid4().hex}"  # safe, unguessable, independent of the original filename
        saved = default_storage.save(key, upload)
        try:
            attachment = Attachment.objects.create(
                organization=org, work_order=work_order, storage_key=saved, original_name=display_name,
                content_type=content_type, size=upload.size, uploaded_by=user)
            Organization.objects.filter(pk=org.pk).update(storage_used=F("storage_used") + upload.size)
            audit(org, user, "attachment.added", "work_order", work_order.pk, None,
                  {"attachment_id": attachment.pk, "name": display_name, "size": upload.size})
            _announce(work_order)
        except Exception:
            default_storage.delete(saved)  # do not leave an orphan file behind
            raise
    return attachment
