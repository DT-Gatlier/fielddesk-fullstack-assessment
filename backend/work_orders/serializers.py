from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from accounts.models import User

from .models import Attachment, WorkOrder
from .services import TRANSITIONS

MAX_WINDOW = timedelta(hours=24)


class WorkOrderSerializer(serializers.ModelSerializer):
    technician_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrder
        fields = ["id", "reference", "title", "description", "priority", "status", "site_name", "technician",
                  "technician_name", "start_at", "end_at", "created_by", "created_at", "updated_at"]
        # organisation, creator, status and the assignment are never taken from a create/edit payload
        read_only_fields = ["reference", "status", "technician", "start_at", "end_at", "created_by", "created_at", "updated_at"]

    def get_technician_name(self, obj):
        return obj.technician.username if obj.technician_id else None

    def validate_title(self, value):
        if not value.strip():
            raise serializers.ValidationError("Title cannot be blank.")
        return value.strip()


class AssignSerializer(serializers.Serializer):
    technician = serializers.IntegerField(min_value=1)
    start_at = serializers.DateTimeField()
    end_at = serializers.DateTimeField()

    def validate(self, attrs):
        if attrs["end_at"] <= attrs["start_at"]:
            raise serializers.ValidationError({"end_at": "End must be after the start."})
        if attrs["end_at"] - attrs["start_at"] > MAX_WINDOW:
            raise serializers.ValidationError({"end_at": "A scheduling window can be at most 24 hours."})
        org_id = self.context["request"].user.organization_id
        technician = User.objects.filter(pk=attrs["technician"], organization_id=org_id,
                                         role=User.Role.TECHNICIAN, is_active=True).first()
        if technician is None:  # also covers technicians of other organisations
            raise serializers.ValidationError({"technician": "Invalid technician."})
        attrs["technician"] = technician
        return attrs


class StatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=WorkOrder.Status.choices)


class AttachmentSerializer(serializers.ModelSerializer):
    class Meta:  # no storage key / path is ever returned
        model = Attachment
        fields = ["id", "original_name", "content_type", "size", "created_at"]
        read_only_fields = fields


STATUS_VALUES = {s for targets in TRANSITIONS.values() for s in targets}


class EventSerializer(serializers.Serializer):
    """The whole request body is untrusted: strict types, allow-listed keys, bounded sizes."""

    eventId = serializers.RegexField(r"^[A-Za-z0-9_-]{1,100}$")
    workOrderId = serializers.IntegerField(min_value=1, max_value=2**62)
    type = serializers.ChoiceField(["status_changed", "note_added"])
    occurredAt = serializers.DateTimeField()
    payload = serializers.DictField()

    def validate_occurredAt(self, value):
        now = timezone.now()
        if value > now + timedelta(minutes=5) or value < now - timedelta(days=7):
            raise serializers.ValidationError("occurredAt must be within the last 7 days and not in the future.")
        return value

    def validate(self, data):
        payload = data["payload"]
        allowed = {"status", "note"} if data["type"] == "status_changed" else {"note"}
        if set(payload) - allowed:
            raise serializers.ValidationError({"payload": "Unknown fields in payload."})
        note = payload.get("note")
        if note is not None and (not isinstance(note, str) or len(note) > 500):
            raise serializers.ValidationError({"payload": "note must be a string of at most 500 characters."})
        if data["type"] == "status_changed":
            status = payload.get("status")
            if not isinstance(status, str) or status not in STATUS_VALUES:
                raise serializers.ValidationError({"payload": "status must be one of: " + ", ".join(sorted(STATUS_VALUES))})
        elif not note:
            raise serializers.ValidationError({"payload": "note is required for note_added."})
        return data
