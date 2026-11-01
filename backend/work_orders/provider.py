"""Controllable mock of an external notification provider.

Mode comes from Redis key `provider:mode` (change at runtime with `manage.py set_provider_mode`) and falls back to
the NOTIFY_PROVIDER_MODE env var. Modes: success | temporary | permanent.
"""
import logging

import redis
from django.conf import settings

from core.realtime import get_redis

logger = logging.getLogger("fielddesk.provider")


class TemporaryProviderError(Exception):
    """Timeouts, 5xx, rate limits: worth retrying."""


class PermanentProviderError(Exception):
    """Invalid recipient, rejected payload: retrying can never help."""


def get_mode():
    try:
        mode = get_redis().get("provider:mode")
    except redis.RedisError:
        mode = None
    return mode or settings.NOTIFY_PROVIDER_MODE


def send(*, technician_id, work_order_id, idempotency_key):
    mode = get_mode()
    if mode == "temporary":
        raise TemporaryProviderError("provider timeout (simulated)")
    if mode == "permanent":
        raise PermanentProviderError("recipient rejected by provider (simulated)")
    logger.info("provider accepted notification", extra={"technician_id": technician_id, "work_order_id": work_order_id,
                                                          "idempotency_key": idempotency_key})
