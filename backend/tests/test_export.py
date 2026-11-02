import csv
import io

import pytest

from tests.conftest import client_for, make_order

pytestmark = pytest.mark.django_db


def export(client, query=""):
    r = client.get(f"/api/work-orders/export/{query}")
    assert r.status_code == 200 and r["Content-Type"].startswith("text/csv")
    return list(csv.DictReader(io.StringIO(b"".join(r.streaming_content).decode())))


def test_export_never_contains_other_organisations_records(world):
    make_order(world.org_a, world.disp_a, title="A-visible")
    make_order(world.org_b, world.disp_b, title="B-SECRET", site_name="B-SECRET-SITE")
    for user in (world.disp_a, world.owner_a):
        rows = export(client_for(user))
        assert [r["title"] for r in rows] == ["A-visible"]
    raw = b"".join(client_for(world.disp_a).get("/api/work-orders/export/").streaming_content).decode()
    assert "B-SECRET" not in raw


def test_export_applies_the_same_filters_as_the_list(world):
    make_order(world.org_a, world.disp_a, title="open one")
    make_order(world.org_a, world.disp_a, title="done one", status="completed")
    c = client_for(world.disp_a)
    assert [r["title"] for r in export(c, "?status=completed")] == ["done one"]
    assert [r["title"] for r in export(c, "?search=open")] == ["open one"]
    assert len(export(c)) == 2


@pytest.mark.parametrize("evil", ["=HYPERLINK(\"http://evil\",\"x\")", "+1+1", "-2+3", "@SUM(A1)", "\t=cmd", "\r=cmd"])
def test_formula_injection_is_neutralised(world, evil):
    make_order(world.org_a, world.disp_a, title=evil, site_name=evil)
    row = export(client_for(world.disp_a))[0]
    assert row["title"] == "'" + evil and row["site"] == "'" + evil


def test_technicians_cannot_export(world):
    assert client_for(world.tech_a).get("/api/work-orders/export/").status_code == 403


def test_export_streams_large_result_sets(world):
    from work_orders.models import WorkOrder
    WorkOrder.objects.bulk_create([
        WorkOrder(organization=world.org_a, created_by=world.disp_a, reference=f"WO-BULK-{i}", title=f"t{i}", site_name="s")
        for i in range(2500)])
    r = client_for(world.disp_a).get("/api/work-orders/export/")
    assert r.streaming  # generator based, never one big in-memory string
    assert sum(1 for _ in b"".join(r.streaming_content).splitlines()) == 2501
