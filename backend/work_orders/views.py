import csv
import secrets

from django.conf import settings
from django.core.files.storage import default_storage
from django.db import IntegrityError, transaction
from django.db.models import Case, Count, IntegerField, Value, When
from django.http import FileResponse, StreamingHttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, NotFound, ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from core.mixins import TenantScopedMixin
from core.models import AuditLog, audit
from core.permissions import IsDispatcher, IsDispatcherOrOwner, IsTechnician
from core.realtime import publish_on_commit
from core.serializers import AuditLogSerializer

from .exceptions import FileTooLarge
from .filters import WorkOrderFilter, WorkOrderOrdering
from .models import Attachment, WorkOrder
from .serializers import AssignSerializer, AttachmentSerializer, EventSerializer, StatusSerializer, WorkOrderSerializer
from .services import assign_work_order, process_progress_event, set_status, store_attachment

EDITABLE = ("title", "description", "priority", "site_name")
PRIORITY_RANK = Case(
    *[When(priority=p, then=Value(i)) for i, p in enumerate(["low", "medium", "high", "urgent"])],
    output_field=IntegerField(),
)


class WorkOrderViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = WorkOrder.objects.select_related("technician", "created_by").annotate(priority_rank=PRIORITY_RANK)
    serializer_class = WorkOrderSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, WorkOrderOrdering]
    filterset_class = WorkOrderFilter
    search_fields = ["reference", "title", "site_name"]
    ordering_fields = ["reference", "title", "priority", "status", "start_at", "created_at"]
    ordering = ["-created_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]  # no PUT / DELETE

    def get_permissions(self):
        if self.action in ("list", "retrieve", "activity"):
            return [IsAuthenticated()]
        if self.action == "attachments" and self.request.method == "GET":
            return [IsAuthenticated()]
        if self.action == "export":
            return [IsDispatcherOrOwner()]  # reporting is read-only, so owners may export too
        return [IsDispatcher()]  # create, edit, assign, status, upload: dispatcher work only (owner manages users/settings)

    # ---- create / edit
    def perform_create(self, serializer):
        user = self.request.user
        for _ in range(5):  # reference collisions are astronomically rare; retry on the unique constraint
            try:
                with transaction.atomic():
                    wo = serializer.save(organization=user.organization, created_by=user,
                                         reference=f"WO-{secrets.token_hex(3).upper()}")
                    audit(user.organization, user, "work_order.created", "work_order", wo.pk, None,
                          {"title": wo.title, "priority": wo.priority, "site_name": wo.site_name})
                    publish_on_commit(wo.organization_id, "work_order.created", id=wo.pk, status=wo.status)
                return
            except IntegrityError as exc:
                if "uq_wo_org_ref" not in str(exc):
                    raise
        raise APIException("Could not allocate a reference number.")

    def perform_update(self, serializer):
        before = {f: getattr(serializer.instance, f) for f in EDITABLE}
        with transaction.atomic():
            wo = serializer.save()
            after = {f: getattr(wo, f) for f in EDITABLE}
            if before != after:
                audit(wo.organization_id, self.request.user, "work_order.updated", "work_order", wo.pk, before, after)
            publish_on_commit(wo.organization_id, "work_order.updated", id=wo.pk, status=wo.status)

    # ---- assignment, status
    @action(detail=True, methods=["patch"])
    def assign(self, request, pk=None):
        wo = self.get_object()  # tenant scoped: other organisations' ids give 404
        serializer = AssignSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        wo = assign_work_order(order_id=wo.pk, organization=request.user.organization, technician=d["technician"],
                               start_at=d["start_at"], end_at=d["end_at"], actor=request.user)
        return Response(WorkOrderSerializer(wo).data)

    @action(detail=True, methods=["patch"], url_path="status")
    def change_status(self, request, pk=None):
        wo = self.get_object()
        serializer = StatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        wo = set_status(order_id=wo.pk, organization=request.user.organization,
                        new_status=serializer.validated_data["status"], actor=request.user)
        return Response(WorkOrderSerializer(wo).data)

    # ---- activity history
    @action(detail=True, methods=["get"])
    def activity(self, request, pk=None):
        wo = self.get_object()
        logs = (AuditLog.objects.filter(organization_id=request.user.organization_id, target_type="work_order", target_id=wo.pk)
                .select_related("actor").order_by("-created_at", "-id")[:200])
        return Response(AuditLogSerializer(logs, many=True).data)

    # ---- attachments
    @action(detail=True, methods=["get", "post"], url_path="attachments", parser_classes=[MultiPartParser])
    def attachments(self, request, pk=None):
        wo = self.get_object()
        if request.method == "GET":
            return Response(AttachmentSerializer(wo.attachments.order_by("-created_at"), many=True).data)
        try:
            declared = int(request.META.get("CONTENT_LENGTH") or 0)
        except ValueError:
            declared = 0
        if declared > settings.MAX_UPLOAD_BYTES + 1_048_576:  # reject obviously huge bodies before parsing them
            raise FileTooLarge()
        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"file": "This field is required."})
        attachment = store_attachment(user=request.user, work_order=wo, upload=upload)
        return Response(AttachmentSerializer(attachment).data, status=201)

    # ---- CSV export
    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        queryset = self.filter_queryset(self.get_queryset())  # same org scope + same filters as the list API
        writer = csv.writer(_Echo())

        def rows():
            yield writer.writerow(["reference", "title", "status", "priority", "site", "technician", "start_at", "end_at", "created_at"])
            for o in queryset.iterator(chunk_size=2000):  # streamed: constant memory for large exports
                yield writer.writerow([
                    _safe(o.reference), _safe(o.title), o.status, o.priority, _safe(o.site_name),
                    _safe(o.technician.username if o.technician_id else ""),
                    o.start_at.isoformat() if o.start_at else "", o.end_at.isoformat() if o.end_at else "",
                    o.created_at.isoformat(),
                ])

        response = StreamingHttpResponse(rows(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="work-orders.csv"'
        return response


class _Echo:
    def write(self, value):
        return value


def _safe(value):
    """Spreadsheet formula injection: cells starting with = + - @ tab or CR are prefixed with an apostrophe."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


class DashboardView(APIView):
    def get(self, request):
        qs = WorkOrder.objects.filter(organization_id=request.user.organization_id)
        if request.user.role == "technician":
            qs = qs.filter(technician_id=request.user.pk)
        counts = {r["status"]: r["n"] for r in qs.values("status").annotate(n=Count("id")).order_by()}
        return Response({"by_status": counts, "total": sum(counts.values())})


class ProgressEventView(APIView):
    permission_classes = [IsTechnician]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "events"

    def post(self, request):
        serializer = EventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event, created = process_progress_event(user=request.user, data=serializer.validated_data)
        return Response({"eventId": event.event_id, "status": "accepted" if created else "duplicate"},
                        status=201 if created else 200)


class AttachmentDownloadView(APIView):
    def get(self, request, pk):
        qs = Attachment.objects.filter(organization_id=request.user.organization_id, pk=pk)  # tenant scope
        if request.user.role == "technician":
            qs = qs.filter(work_order__technician_id=request.user.pk)
        attachment = qs.first()
        if attachment is None:
            raise NotFound()
        response = FileResponse(default_storage.open(attachment.storage_key, "rb"),
                                content_type=attachment.content_type, as_attachment=True,
                                filename=f"attachment-{attachment.pk}")
        response["X-Content-Type-Options"] = "nosniff"
        return response
