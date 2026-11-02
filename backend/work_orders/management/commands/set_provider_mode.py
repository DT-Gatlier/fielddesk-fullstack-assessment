from django.core.management.base import BaseCommand

from core.realtime import get_redis


class Command(BaseCommand):
    help = "Switch the mock notification provider at runtime: success | temporary | permanent"

    def add_arguments(self, parser):
        parser.add_argument("mode", choices=["success", "temporary", "permanent"])

    def handle(self, *args, **opts):
        get_redis().set("provider:mode", opts["mode"])
        self.stdout.write(f"provider mode = {opts['mode']}")
