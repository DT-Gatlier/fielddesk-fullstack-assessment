import django_filters as df
from rest_framework.filters import OrderingFilter

from .models import WorkOrder


class WorkOrderFilter(df.FilterSet):
    status = df.MultipleChoiceFilter(choices=WorkOrder.Status.choices)
    priority = df.MultipleChoiceFilter(choices=WorkOrder.Priority.choices)
    technician = df.NumberFilter(field_name="technician_id")
    start_after = df.IsoDateTimeFilter(field_name="start_at", lookup_expr="gte")
    start_before = df.IsoDateTimeFilter(field_name="start_at", lookup_expr="lte")

    class Meta:
        model = WorkOrder
        fields = []


class WorkOrderOrdering(OrderingFilter):
    """`priority` sorts by urgency rank (annotated on the queryset), not alphabetically. Adds -id for stable paging."""

    def get_ordering(self, request, queryset, view):
        ordering = list(super().get_ordering(request, queryset, view) or [])
        mapped = [o.replace("priority", "priority_rank") if o.lstrip("-") == "priority" else o for o in ordering]
        return [*mapped, "-id"]
