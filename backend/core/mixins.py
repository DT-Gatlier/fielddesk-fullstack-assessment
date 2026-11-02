class TenantScopedMixin:
    """Every query is limited to the caller's organisation (taken from request.user, never from the client).

    Technicians additionally only see work orders assigned to them. Objects outside the scope give 404, not 403,
    so IDs of other organisations cannot even be probed.
    """

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset().filter(organization_id=user.organization_id)
        if user.role == "technician":
            qs = qs.filter(technician_id=user.pk)
        return qs
