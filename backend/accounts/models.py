from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


class Organization(models.Model):
    name = models.CharField(max_length=200, unique=True)
    storage_limit = models.BigIntegerField(default=settings.ORG_STORAGE_LIMIT_BYTES)
    storage_used = models.BigIntegerField(default=0)

    def __str__(self):
        return self.name


class User(AbstractUser):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        DISPATCHER = "dispatcher", "Dispatcher"
        TECHNICIAN = "technician", "Technician"

    email = models.EmailField(unique=True)
    organization = models.ForeignKey(Organization, null=True, blank=True, on_delete=models.PROTECT, related_name="users")
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.TECHNICIAN)

    def __str__(self):
        return self.username
