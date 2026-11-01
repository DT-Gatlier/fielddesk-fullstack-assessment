import uuid
from datetime import timedelta
from types import SimpleNamespace

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Organization, User
from work_orders.models import WorkOrder

PASSWORD = "Str0ng-Pass!word1"


@pytest.fixture(autouse=True)
def _isolation(settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)  # uploads never touch real storage
    cache.clear()  # rate-limit counters
    yield


def make_user(org, role, name):
    return User.objects.create_user(username=name, email=f"{name}@example.test", password=PASSWORD,
                                    organization=org, role=role)


def make_order(org, creator, **kw):
    data = {"reference": f"WO-{uuid.uuid4().hex[:8].upper()}", "title": "Fix pump", "priority": "medium",
            "site_name": "Site A", **kw}
    return WorkOrder.objects.create(organization=org, created_by=creator, **data)


def make_assigned(org, creator, tech, start_hours=0, length=2, **kw):
    """Work order already assigned: the DB requires a window whenever a technician is set."""
    from django.utils.dateparse import parse_datetime
    start, end = window(start_hours, length)
    return make_order(org, creator, technician=tech, start_at=parse_datetime(start), end_at=parse_datetime(end), **kw)


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def window(start_hours, length_hours=2, base=None):
    """(start, end) ISO strings relative to a fixed day so tests are deterministic."""
    base = base or (timezone.now() + timedelta(days=2)).replace(minute=0, second=0, microsecond=0)
    start = base + timedelta(hours=start_hours)
    return start.isoformat(), (start + timedelta(hours=length_hours)).isoformat()


def assign_payload(tech, start_hours=0, length=2):
    start, end = window(start_hours, length)
    return {"technician": tech.pk, "start_at": start, "end_at": end}


@pytest.fixture
def world(db):
    org_a = Organization.objects.create(name="Org A")
    org_b = Organization.objects.create(name="Org B")
    w = SimpleNamespace(org_a=org_a, org_b=org_b)
    for tag, org in (("a", org_a), ("b", org_b)):
        setattr(w, f"owner_{tag}", make_user(org, "owner", f"owner_{tag}"))
        setattr(w, f"disp_{tag}", make_user(org, "dispatcher", f"disp_{tag}"))
        setattr(w, f"tech_{tag}", make_user(org, "technician", f"tech_{tag}"))
    w.disp_a2 = make_user(org_a, "dispatcher", "disp_a2")
    w.tech_a2 = make_user(org_a, "technician", "tech_a2")
    return w
