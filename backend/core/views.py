import logging

import redis
from django.conf import settings
from django.db import connection
from django.http import HttpResponse, JsonResponse, StreamingHttpResponse
from django.views.decorators.http import require_GET
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User

from .models import AuditLog
from .permissions import IsDispatcherOrOwner
from .realtime import channel_for, get_redis, issue_ticket, redeem_ticket
from .serializers import AuditLogSerializer

logger = logging.getLogger("fielddesk.core")


def health(request):
    return JsonResponse({"status": "ok"})  # liveness: the process is up


def ready(request):
    checks = {}
    try:
        connection.ensure_connection()
        checks["database"] = "ok"
    except Exception:  # noqa: BLE001
        checks["database"] = "error"
    try:
        get_redis().ping()
        checks["redis"] = "ok"
    except redis.RedisError:
        checks["redis"] = "error"
    ok = all(v == "ok" for v in checks.values())
    return JsonResponse({"status": "ready" if ok else "unavailable", "checks": checks}, status=200 if ok else 503)


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only, organisation-scoped audit history."""

    permission_classes = [IsDispatcherOrOwner]
    serializer_class = AuditLogSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["action", "target_type", "target_id"]

    def get_queryset(self):
        return (
            AuditLog.objects.filter(organization_id=self.request.user.organization_id)
            .select_related("actor").order_by("-created_at", "-id")
        )


class StreamTicketView(APIView):
    def post(self, request):
        return Response({"ticket": issue_ticket(request.user.pk)})


@require_GET
def stream(request):
    """Server-Sent Events. Auth = one-time ticket; the organisation comes from the ticket's user, not the URL."""
    uid = redeem_ticket(request.GET.get("ticket", ""))
    user = User.objects.filter(pk=uid, is_active=True).first() if uid else None
    if user is None or not user.organization_id:
        return HttpResponse(status=401)
    channel = channel_for(user.organization_id)
    poll = settings.SSE_POLL_TIMEOUT

    def events():
        pubsub = get_redis().pubsub()
        try:
            pubsub.subscribe(channel)
            pubsub.get_message(timeout=2)  # consume the subscribe confirmation
            yield "retry: 3000\n\n"  # browser reconnect delay (ms)
            while True:
                msg = pubsub.get_message(ignore_subscribe_messages=True, timeout=poll)
                yield f"data: {msg['data']}\n\n" if msg else ": ping\n\n"  # ping keeps proxies from closing idle streams
        finally:
            pubsub.close()

    response = StreamingHttpResponse(events(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response
