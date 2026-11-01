from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import Organization, User
from work_orders.models import WorkOrder

ORGS = {"Acme Maintenance": "acme", "Borealis Services": "borealis"}
USERS = [("owner", "owner"), ("dispatcher", "dispatcher"), ("technician", "tech1"), ("technician", "tech2")]


class Command(BaseCommand):
    help = (
        "Bootstrap/demo data (idempotent): two organisations, every role, a few work orders. "
        "Bootstrap only: normal user creation goes through the owner-only /api/users/ endpoint."
    )

    def handle(self, *args, **opts):
        for name, slug in ORGS.items():
            org, _ = Organization.objects.get_or_create(name=name)
            made = {}
            for role, handle in USERS:
                user, created = User.objects.get_or_create(
                    email=f"{handle}@{slug}.test",
                    defaults={"username": f"{handle}_{slug}", "role": role, "organization": org},
                )
                if created:
                    user.set_password(settings.SEED_PASSWORD)  # hashed (PBKDF2), never stored in plain text
                    user.save(update_fields=["password"])
                made[handle] = user
            start = (timezone.now() + timedelta(days=1)).replace(minute=0, second=0, microsecond=0)
            samples = [
                ("001", "Replace HVAC filter", "high", "Riverside Plaza", made["tech1"], start),
                ("002", "Inspect generator", "medium", "North Depot", None, None),
                ("003", "Fix loading-bay door", "urgent", "Harbour Warehouse", None, None),
            ]
            for num, title, prio, site, tech, begin in samples:
                WorkOrder.objects.get_or_create(
                    organization=org, reference=f"WO-{slug[:4].upper()}-{num}",
                    defaults={"title": title, "priority": prio, "site_name": site, "created_by": made["dispatcher"],
                              "technician": tech, "start_at": begin, "end_at": begin + timedelta(hours=2) if begin else None},
                )
        self.stdout.write(self.style.SUCCESS("Seed data ready"))
