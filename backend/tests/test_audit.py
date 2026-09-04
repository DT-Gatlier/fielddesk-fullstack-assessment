import pytest
import asyncio
from httpx import AsyncClient
import uuid
from app.main import app
from app.models import Organisation, Role, User, WorkOrder, Base
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.auth import get_password_hash, create_access_token
from app import deps

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


TEST_DATABASE_URL = "postgresql://fielddesk:securepassword@localhost:5432/fielddesk_test"
try:
    engine = create_engine(TEST_DATABASE_URL)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
except Exception:
    engine = None
    TestingSessionLocal = None

@pytest.fixture(scope="module")
def setup_db():
    if not engine:
        pytest.skip("Database not configured")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    org_id = uuid.uuid4()
    # bypass RLS for setup
    db.execute(text("SET LOCAL row_security = OFF"))
    
    org = Organisation(id=org_id, name="Test Org 2")
    role_owner = Role(organisation_id=org_id, name="owner")
    
    owner = User(email=f"owner_{uuid.uuid4()}@test.com", hashed_password=get_password_hash("pw"), role=role_owner, organisation_id=org_id)
    
    db.add_all([org, role_owner, owner])
    db.commit()
    db.refresh(owner)
    
    wo1 = WorkOrder(organisation_id=org_id, title="Audit WO", status="open")
    db.add(wo1)
    db.commit()
    db.refresh(wo1)
    
    token = create_access_token({"sub": str(owner.id), "org_id": str(org_id), "role_id": str(role_owner.id)})
    
    yield {
        "token": token,
        "owner_id": owner.id,
        "wo1_id": wo1.id
    }
    db.close()

@pytest.mark.asyncio
async def test_audit_csv_export(setup_db):
    data = setup_db
    token = data["token"]
    
    # 1. Download CSV Export
    async with AsyncClient(app=app, base_url="http://test") as client:
        resp = await client.get(f"/work-orders/export?token={token}")
        
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]
        
        csv_data = resp.text
        assert "Audit WO" in csv_data

@pytest.mark.asyncio
async def test_attachments_audit(setup_db):
    data = setup_db
    token = data["token"]
    wo_id = data["wo1_id"]
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        # Upload attachment
        files = {"file": ("test.txt", b"hello world", "text/plain")}
        data_payload = {"work_order_id": str(wo_id)}
        resp = await client.post("/attachments", files=files, data=data_payload, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 201
        attachment_id = resp.json()["id"]
        
        # Check audit log for creation
        db = TestingSessionLocal()
        from app.models import AuditEntry
        audit_logs = db.query(AuditEntry).filter(AuditEntry.action == "upload_attachment", AuditEntry.entity_id == attachment_id).all()
        assert len(audit_logs) == 1
        
        # Delete attachment
        resp_del = await client.delete(f"/attachments/{attachment_id}", headers={"Authorization": f"Bearer {token}"})
        assert resp_del.status_code == 204
        
        # Check audit log for deletion
        audit_logs_del = db.query(AuditEntry).filter(AuditEntry.action == "delete_attachment", AuditEntry.entity_id == attachment_id).all()
        assert len(audit_logs_del) == 1
        db.close()

@pytest.mark.asyncio
async def test_role_audit(setup_db):
    data = setup_db
    token = data["token"]
    
    # We need a new user and role to test role update
    db = TestingSessionLocal()
    from app.models import Role, User
    from app.auth import get_password_hash
    org_id = db.query(User).filter(User.id == data["owner_id"]).first().organisation_id
    role_tech = Role(organisation_id=org_id, name="technician")
    user2 = User(email=f"tech_{uuid.uuid4()}@test.com", hashed_password=get_password_hash("pw"), role=role_tech, organisation_id=org_id)
    db.add_all([role_tech, user2])
    db.commit()
    user2_id = str(user2.id)
    role_tech_name = role_tech.name
    
    # Let's say owner updates user2 to 'owner'
    role_owner = db.query(Role).filter(Role.organisation_id == org_id, Role.name == "owner").first()
    db.close()
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        resp = await client.patch(f"/users/{user2_id}", json={"role": "owner"}, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        
        db = TestingSessionLocal()
        from app.models import AuditEntry
        audit_logs = db.query(AuditEntry).filter(AuditEntry.action == "update_user_role", AuditEntry.entity_id == user2_id).all()
        assert len(audit_logs) == 1
        db.close()

def test_worker_audit():
    db = TestingSessionLocal()
    from app.models import AuditEntry, Notification, User, WorkOrder
    from app.worker import send_assignment_notification
    import uuid
    import datetime
    
    # We need an owner for the org to simulate the actor (or the system)
    org = db.query(User).first().organisation_id
    from app.models import Role
    tech_role = db.query(Role).filter(Role.name == "technician", Role.organisation_id == org).first()
    
    tech = User(
        id=uuid.uuid4(),
        organisation_id=org,
        email=f"tech_{uuid.uuid4()}@example.com",
        role_id=tech_role.id,
        hashed_password="xxx",
    )
    db.add(tech)
    
    new_wo = WorkOrder(
        id=uuid.uuid4(),
        organisation_id=org,
        title="Test WO",
        description="Test WO for audit",
        status="open"
    )
    db.add(new_wo)
    db.commit()
    db.refresh(new_wo)
    
    notif = Notification(
        id=uuid.uuid4(),
        technician_id=tech.id,
        work_order_id=new_wo.id,
        status="pending",
        attempts=2
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    
    notif_id = notif.id
    
    # Run the celery task synchronously
    import app.worker
    original_session_local = app.worker.SessionLocal
    app.worker.SessionLocal = lambda: db
    
    try:
        send_assignment_notification.apply(args=(str(notif.id),)).get()
    except Exception:
        pass
    finally:
        app.worker.SessionLocal = original_session_local
        
    db = TestingSessionLocal()
    audit_logs = db.query(AuditEntry).filter(AuditEntry.action == "notification_outcome", AuditEntry.entity_id == notif_id).all()
    assert len(audit_logs) > 0
    db.close()
