from django.urls import include, path
from rest_framework.routers import DefaultRouter

from accounts import views as acc
from core import views as core
from work_orders import views as wo

router = DefaultRouter()
router.register("work-orders", wo.WorkOrderViewSet, basename="work-order")
router.register("users", acc.UserViewSet, basename="user")
router.register("audit-logs", core.AuditLogViewSet, basename="audit-log")

urlpatterns = [
    path("health", core.health),
    path("ready", core.ready),
    path("api/auth/login/", acc.LoginView.as_view()),
    path("api/auth/refresh/", acc.RefreshTokenView.as_view()),
    path("api/auth/logout/", acc.LogoutView.as_view()),
    path("api/me/", acc.MeView.as_view()),
    path("api/organization/", acc.OrganizationView.as_view()),
    path("api/technicians/", acc.TechnicianListView.as_view()),
    path("api/dashboard/", wo.DashboardView.as_view()),
    path("api/events/", wo.ProgressEventView.as_view()),
    path("api/attachments/<int:pk>/download/", wo.AttachmentDownloadView.as_view()),
    path("api/stream-ticket/", core.StreamTicketView.as_view()),
    path("api/stream/", core.stream),
    path("api/", include(router.urls)),
]
