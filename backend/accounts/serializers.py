from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.db.models import Q
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed

from .models import Organization, User


class LoginSerializer(serializers.Serializer):
    login = serializers.CharField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        candidate = User.objects.filter(
            Q(username__iexact=attrs["login"]) | Q(email__iexact=attrs["login"])
        ).first()
        user = authenticate(username=candidate.username, password=attrs["password"]) if candidate else None
        if user is None or not user.organization_id:
            raise AuthenticationFailed("Invalid credentials.")  # same answer for unknown user / wrong password
        attrs["user"] = user
        return attrs


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, trim_whitespace=False)

    class Meta:
        model = User
        fields = ["id", "username", "email", "role", "is_active", "password"]

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate(self, attrs):
        me = self.context["request"].user
        if self.instance is None and not attrs.get("password"):
            raise serializers.ValidationError({"password": "This field is required."})
        if self.instance is not None and self.instance.pk == me.pk:  # prevent owner lock-out
            if "role" in attrs and attrs["role"] != self.instance.role:
                raise serializers.ValidationError({"role": "You cannot change your own role."})
            if attrs.get("is_active") is False:
                raise serializers.ValidationError({"is_active": "You cannot deactivate your own account."})
        return attrs

    def create(self, validated_data):
        # organisation ALWAYS comes from the authenticated owner
        return User.objects.create_user(organization=self.context["request"].user.organization, **validated_data)

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        instance = super().update(instance, validated_data)
        if password:
            instance.set_password(password)
            instance.save(update_fields=["password"])
        return instance


class MeSerializer(serializers.ModelSerializer):
    organization = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "email", "role", "organization"]

    def get_organization(self, obj):
        return {"id": obj.organization_id, "name": obj.organization.name} if obj.organization_id else None


class TechnicianSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username"]


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ["id", "name", "storage_limit", "storage_used"]
        read_only_fields = ["id", "storage_limit", "storage_used"]
