from rest_framework.permissions import BasePermission


class HasRole(BasePermission):
    """Role comes from the authenticated user row in the database, never from the request."""

    roles = ()

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.organization_id and user.role in self.roles)


class IsOwner(HasRole):
    roles = ("owner",)


class IsDispatcher(HasRole):
    roles = ("dispatcher",)


class IsTechnician(HasRole):
    roles = ("technician",)


class IsDispatcherOrOwner(HasRole):
    roles = ("owner", "dispatcher")
