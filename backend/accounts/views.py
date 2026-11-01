from django.conf import settings
from rest_framework import mixins, status, viewsets
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.authentication import LoginAuthentication
from core.models import audit
from core.permissions import IsDispatcherOrOwner, IsOwner

from .models import User
from .serializers import LoginSerializer, MeSerializer, OrganizationSerializer, TechnicianSerializer, UserSerializer


def set_refresh_cookie(response, token):
    response.set_cookie(
        "refresh_token", str(token), httponly=True, samesite="Lax",
        secure=settings.COOKIE_SECURE, max_age=3600, path="/api/auth/",
    )


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [LoginAuthentication]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        refresh = RefreshToken.for_user(user)
        response = Response({"access_token": str(refresh.access_token), "username": user.username, "role": user.role})
        set_refresh_cookie(response, refresh)
        return response


class RefreshTokenView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        raw = request.COOKIES.get("refresh_token")
        if not raw:
            return Response({"error": {"code": "unauthenticated", "message": "Not authenticated.", "details": None,
                                       "request_id": request.META.get("REQUEST_ID")}}, status=401)
        try:
            old = RefreshToken(raw)  # expired or blacklisted -> TokenError
            user = User.objects.get(pk=old["user_id"], is_active=True)
            old.blacklist()  # rotation: every refresh token is single use
        except (TokenError, User.DoesNotExist):
            return Response({"error": {"code": "unauthenticated", "message": "Not authenticated.", "details": None,
                                       "request_id": request.META.get("REQUEST_ID")}}, status=401)
        new = RefreshToken.for_user(user)
        response = Response({"access_token": str(new.access_token)})
        set_refresh_cookie(response, new)
        return response


class LogoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        raw = request.COOKIES.get("refresh_token")
        if raw:
            try:
                RefreshToken(raw).blacklist()
            except TokenError:
                pass
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie("refresh_token", path="/api/auth/")
        return response


class MeView(APIView):
    def get(self, request):
        return Response(MeSerializer(request.user).data)


class OrganizationView(APIView):
    """Organisation settings: anyone in the org can read, only the owner can rename."""

    def get_permissions(self):
        return [IsOwner()] if self.request.method == "PATCH" else [IsAuthenticated()]

    def get(self, request):
        return Response(OrganizationSerializer(request.user.organization).data)

    def patch(self, request):
        org = request.user.organization
        serializer = OrganizationSerializer(org, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        before = {"name": org.name}
        org = serializer.save()
        audit(org, request.user, "organization.updated", "organization", org.pk, before, {"name": org.name})
        return Response(serializer.data)


class TechnicianListView(ListAPIView):
    permission_classes = [IsDispatcherOrOwner]
    serializer_class = TechnicianSerializer
    pagination_class = None

    def get_queryset(self):
        return User.objects.filter(
            organization_id=self.request.user.organization_id, role=User.Role.TECHNICIAN, is_active=True
        ).order_by("username")


class UserViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                  mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Owner-only user management, always inside the owner's own organisation. Users are deactivated, not deleted."""

    permission_classes = [IsOwner]
    serializer_class = UserSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return User.objects.filter(organization_id=self.request.user.organization_id).order_by("username")

    def perform_create(self, serializer):
        user = serializer.save()
        audit(user.organization_id, self.request.user, "user.created", "user", user.pk, None,
              {"username": user.username, "role": user.role})

    def perform_update(self, serializer):
        old_role, old_active = serializer.instance.role, serializer.instance.is_active
        user = serializer.save()
        if old_role != user.role:
            audit(user.organization_id, self.request.user, "user.role_changed", "user", user.pk,
                  {"role": old_role}, {"role": user.role})
        if old_active != user.is_active:
            audit(user.organization_id, self.request.user, "user.active_changed", "user", user.pk,
                  {"is_active": old_active}, {"is_active": user.is_active})
