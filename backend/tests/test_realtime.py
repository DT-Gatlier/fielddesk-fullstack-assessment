import json

import pytest
from django.test import RequestFactory
from rest_framework.test import APIClient

from core.realtime import publish
from core.views import stream
from tests.conftest import client_for

pytestmark = pytest.mark.django_db


def open_stream(user):
    ticket = client_for(user).post("/api/stream-ticket/").data["ticket"]
    response = stream(RequestFactory().get("/api/stream/", {"ticket": ticket}))
    return ticket, response


def test_stream_requires_a_valid_ticket():
    assert stream(RequestFactory().get("/api/stream/")).status_code == 401
    assert stream(RequestFactory().get("/api/stream/", {"ticket": "forged"})).status_code == 401
    assert APIClient().post("/api/stream-ticket/").status_code == 401  # tickets need a logged-in user


def test_ticket_is_single_use(world):
    ticket, response = open_stream(world.disp_a)
    assert response.status_code == 200 and response["Content-Type"] == "text/event-stream"
    response.close()
    assert stream(RequestFactory().get("/api/stream/", {"ticket": ticket})).status_code == 401


def test_events_never_cross_organisation_boundaries(world):
    _, response = open_stream(world.disp_a)  # subscribed as a user of org A
    chunks = iter(response.streaming_content)
    assert next(chunks) == b"retry: 3000\n\n"
    publish(world.org_b.pk, "work_order.updated", id=999)  # another tenant's change, published FIRST
    publish(world.org_a.pk, "work_order.updated", id=111)
    message = next(chunks).decode()
    response.close()
    assert message.startswith("data: ")
    payload = json.loads(message[6:])
    assert payload == {"kind": "work_order.updated", "id": 111}  # org B's event (id 999) was never delivered


def test_idle_stream_sends_keepalive_pings(world):
    _, response = open_stream(world.disp_a)
    chunks = iter(response.streaming_content)
    next(chunks)
    assert next(chunks) == b": ping\n\n"  # keeps proxies from closing idle connections
    response.close()


def test_deactivated_user_ticket_is_refused(world):
    ticket = client_for(world.disp_a).post("/api/stream-ticket/").data["ticket"]
    world.disp_a.is_active = False
    world.disp_a.save()
    assert stream(RequestFactory().get("/api/stream/", {"ticket": ticket})).status_code == 401
