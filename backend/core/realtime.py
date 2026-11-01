"""Real-time fan-out over Redis pub/sub, one channel per organisation (org:<id>).

Delivery is best-effort. The REST API is the source of truth; clients refetch after reconnecting.
"""
import json
import logging
import secrets

import redis
from django.conf import settings
from django.db import transaction

logger = logging.getLogger("fielddesk.realtime")
_client = None
TICKET_TTL_SECONDS = 30


def get_redis():
    global _client
    if _client is None:
        _client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _client


def channel_for(org_id):
    return f"org:{org_id}"


def publish(org_id, kind, **data):
    try:
        get_redis().publish(channel_for(org_id), json.dumps({"kind": kind, **data}))
    except redis.RedisError:
        logger.warning("realtime publish failed", extra={"org_id": org_id, "kind": kind})


def publish_on_commit(org_id, kind, **data):
    """Only announce changes that were actually committed."""
    transaction.on_commit(lambda: publish(org_id, kind, **data), robust=True)


def issue_ticket(user_id):
    """EventSource cannot send an Authorization header, so clients exchange their JWT for a one-time ticket."""
    ticket = secrets.token_urlsafe(24)
    get_redis().setex(f"ticket:{ticket}", TICKET_TTL_SECONDS, user_id)
    return ticket


def redeem_ticket(ticket):
    if not ticket:
        return None
    return get_redis().getdel(f"ticket:{ticket}")  # atomic: a ticket works exactly once
