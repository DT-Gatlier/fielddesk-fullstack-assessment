from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = ["id", "action", "actor", "actor_name", "target_type", "target_id", "before", "after", "created_at"]
        read_only_fields = fields

    def get_actor_name(self, obj):
        return obj.actor.username if obj.actor_id else "system"
