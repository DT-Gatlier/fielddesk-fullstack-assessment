from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateTimeRangeField, RangeBoundary, RangeOperators
from django.db import models
from django.db.models import F, Func, Q


class TsTzRange(Func):
    function = "TSTZRANGE"
    output_field = DateTimeRangeField()


class WorkOrder(models.Model):
    class Status(models.TextChoices):
        OPEN = "open"
        IN_PROGRESS = "in_progress"
        ON_HOLD = "on_hold"
        COMPLETED = "completed"
        CANCELLED = "cancelled"

    class Priority(models.TextChoices):
        LOW = "low"
        MEDIUM = "medium"
        HIGH = "high"
        URGENT = "urgent"

    organization = models.ForeignKey("accounts.Organization", on_delete=models.CASCADE)
    reference = models.CharField(max_length=32)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.OPEN)
    site_name = models.CharField(max_length=200)
    technician = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="assigned_orders")
    start_at = models.DateTimeField(null=True, blank=True)
    end_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "reference"], name="uq_wo_org_ref"),
            models.CheckConstraint(condition=Q(end_at__gt=F("start_at")), name="ck_wo_window"),
            # an assigned order must have a window (a NULL range would be unbounded and overlap everything)
            models.CheckConstraint(
                condition=Q(technician__isnull=True) | (Q(start_at__isnull=False) & Q(end_at__isnull=False)),
                name="ck_wo_assigned_has_window",
            ),
            # THE concurrency guarantee: Postgres itself refuses two active orders for one technician with overlapping windows
            ExclusionConstraint(
                name="ex_no_tech_overlap",
                expressions=[
                    ("technician", RangeOperators.EQUAL),
                    (TsTzRange("start_at", "end_at", RangeBoundary()), RangeOperators.OVERLAPS),
                ],
                condition=Q(technician__isnull=False) & ~Q(status__in=["completed", "cancelled"]),
            ),
        ]
        indexes = [
            models.Index(fields=["organization", "status"], name="ix_wo_org_status"),
            models.Index(fields=["organization", "-created_at"], name="ix_wo_org_created"),
            models.Index(fields=["technician", "start_at"], name="ix_wo_tech_start"),
        ]

    def __str__(self):
        return self.reference


class ProgressEvent(models.Model):
    """Immutable record of an accepted technician event. (organization, event_id) is unique => idempotency."""

    organization = models.ForeignKey("accounts.Organization", on_delete=models.PROTECT)
    event_id = models.CharField(max_length=100)
    work_order = models.ForeignKey(WorkOrder, on_delete=models.PROTECT, related_name="events")
    actor = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    type = models.CharField(max_length=30)
    occurred_at = models.DateTimeField()
    payload = models.JSONField()
    payload_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "event_id"], name="uq_event_org_eid")]

    def save(self, *args, **kwargs):
        if self.pk:
            raise RuntimeError("Progress events are immutable")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError("Progress events cannot be deleted")


class Attachment(models.Model):
    organization = models.ForeignKey("accounts.Organization", on_delete=models.PROTECT)
    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name="attachments")
    storage_key = models.CharField(max_length=255, unique=True)  # server generated, never exposed
    original_name = models.CharField(max_length=100)  # display only, never used as a path
    content_type = models.CharField(max_length=50)  # detected from file content, not from the client
    size = models.BigIntegerField()
    uploaded_by = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["organization", "work_order"], name="ix_att_org_wo")]


class NotificationLog(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"
        RETRYING = "retrying"
        SENT = "sent"
        FAILED_PERMANENT = "failed_permanent"
        FAILED_EXHAUSTED = "failed_exhausted"
        SKIPPED = "skipped"

    organization = models.ForeignKey("accounts.Organization", on_delete=models.PROTECT)
    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name="notifications")
    technician = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="+")
    dedupe_key = models.CharField(max_length=100, unique=True)  # one notification per (order, technician, assignment version)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
