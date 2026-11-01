import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from accounts.models import Organization
from work_orders.models import Attachment
from tests.conftest import client_for, make_assigned, make_order

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 200
PDF = b"%PDF-1.4\n" + b"0" * 200
pytestmark = pytest.mark.django_db


def upload(client, order, content=PNG, name="photo.png", ctype="image/png"):
    f = SimpleUploadedFile(name, content, content_type=ctype)
    return client.post(f"/api/work-orders/{order.pk}/attachments/", {"file": f}, format="multipart")


def test_png_and_pdf_are_accepted_and_no_path_is_exposed(world):
    order = make_order(world.org_a, world.disp_a)
    c = client_for(world.disp_a)
    r = upload(c, order)
    assert r.status_code == 201
    assert set(r.data) == {"id", "original_name", "content_type", "size", "created_at"}  # no storage key / path
    assert upload(c, order, PDF, "doc.pdf", "application/pdf").data["content_type"] == "application/pdf"
    assert Organization.objects.get(pk=world.org_a.pk).storage_used == len(PNG) + len(PDF)


def test_storage_key_is_generated_and_ignores_the_original_filename(world):
    order = make_order(world.org_a, world.disp_a)
    upload(client_for(world.disp_a), order, name="../../etc/passwd.png")
    att = Attachment.objects.get()
    assert "passwd" not in att.storage_key and ".." not in att.storage_key
    assert att.original_name == "passwd.png"  # path components stripped, display only
    from django.core.files.storage import default_storage
    assert default_storage.exists(att.storage_key)  # stored under the generated key


@pytest.mark.parametrize("content,name,ctype", [
    (b"MZ\x90\x00 not an image", "virus.png", "image/png"),  # exe renamed to .png, lying content-type
    (b"<svg onload=alert(1)></svg>", "x.svg", "image/svg+xml"),
    (b"<html><script>1</script></html>", "x.pdf", "application/pdf"),
])
def test_content_is_sniffed_not_trusted(world, content, name, ctype):
    order = make_order(world.org_a, world.disp_a)
    r = upload(client_for(world.disp_a), order, content, name, ctype)
    assert r.status_code == 415 and r.data["error"]["code"] == "unsupported_file_type"
    assert Attachment.objects.count() == 0


def test_size_limit_is_enforced_by_the_backend(world, settings):
    settings.MAX_UPLOAD_BYTES = 1024
    order = make_order(world.org_a, world.disp_a)
    r = upload(client_for(world.disp_a), order, PNG + b"0" * 2000)
    assert r.status_code == 413 and r.data["error"]["code"] == "file_too_large"


def test_organisation_quota_is_enforced(world):
    Organization.objects.filter(pk=world.org_a.pk).update(storage_limit=len(PNG) * 2 - 1)
    order = make_order(world.org_a, world.disp_a)
    c = client_for(world.disp_a)
    assert upload(c, order).status_code == 201
    r = upload(c, order)
    assert r.status_code == 413 and r.data["error"]["code"] == "storage_quota_exceeded"
    assert Attachment.objects.count() == 1
    assert Organization.objects.get(pk=world.org_a.pk).storage_used == len(PNG)
    # another organisation is unaffected by A's quota
    assert upload(client_for(world.disp_b), make_order(world.org_b, world.disp_b)).status_code == 201


def test_download_returns_the_exact_bytes_with_safe_headers(world):
    order = make_assigned(world.org_a, world.disp_a, world.tech_a)
    att_id = upload(client_for(world.disp_a), order).data["id"]
    r = client_for(world.tech_a).get(f"/api/attachments/{att_id}/download/")  # assigned technician may read
    assert r.status_code == 200 and b"".join(r.streaming_content) == PNG
    assert r["Content-Type"] == "image/png" and "attachment" in r["Content-Disposition"]
    assert r["X-Content-Type-Options"] == "nosniff"


def test_download_access_control(world):
    order = make_assigned(world.org_a, world.disp_a, world.tech_a)
    att_id = upload(client_for(world.disp_a), order).data["id"]
    url = f"/api/attachments/{att_id}/download/"
    assert client_for(world.disp_b).get(url).status_code == 404  # other organisation
    assert client_for(world.tech_a2).get(url).status_code == 404  # technician not assigned to this order
    from rest_framework.test import APIClient
    assert APIClient().get(url).status_code == 401


def test_technicians_cannot_upload(world):
    order = make_assigned(world.org_a, world.disp_a, world.tech_a)
    assert upload(client_for(world.tech_a), order).status_code == 403
