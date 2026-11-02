from django.core.serializers.json import DjangoJSONEncoder
from django.db import models


class AuditLog(models.Model):
    """Append-only history. No update/delete endpoint exists, and the model refuses both."""

    organization = models.ForeignKey("accounts.Organization", on_delete=models.PROTECT)
    actor = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.PROTECT)  # null = system
    action = models.CharField(max_length=50)
    target_type = models.CharField(max_length=30)
    target_id = models.BigIntegerField()
    before = models.JSONField(null=True, blank=True, encoder=DjangoJSONEncoder)
    after = models.JSONField(null=True, blank=True, encoder=DjangoJSONEncoder)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["organization", "target_type", "target_id"], name="ix_audit_target"),
            models.Index(fields=["organization", "-created_at"], name="ix_audit_org_time"),
        ]

    def save(self, *args, **kwargs):
        if self.pk:
            raise RuntimeError("Audit entries are immutable")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError("Audit entries cannot be deleted")


def audit(organization, actor, action, target_type, target_id, before=None, after=None):
    return AuditLog.objects.create(
        organization_id=getattr(organization, "pk", organization),
        actor=actor, action=action, target_type=target_type, target_id=target_id, before=before, after=after,
    )
