import pytest
import asyncio
from httpx import AsyncClient
import uuid
from app.main import app
from app.models import Organisation, Role, User, WorkOrder, Base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.auth import get_password_hash, create_access_token
import os

TEST_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db:5432/fielddesk")
engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    org_id = uuid.uuid4()
    org = Organisation(id=org_id, name="Concurrency Test Org")
    role_dispatch = Role(id=uuid.uuid4(), organisation_id=org_id, name="dispatcher")
    role_tech = Role(id=uuid.uuid4(), organisation_id=org_id, name="technician")
    
    dispatcher = User(id=uuid.uuid4(), email=f"disp_{uuid.uuid4()}@conc.com", hashed_password=get_password_hash("test"), role=role_dispatch, organisation_id=org_id)
    tech1 = User(id=uuid.uuid4(), email=f"tech1_{uuid.uuid4()}@conc.com", hashed_password=get_password_hash("test"), role=role_tech, organisation_id=org_id)
    
    wo1 = WorkOrder(id=uuid.uuid4(), organisation_id=org_id, title="Concurrency Job", status="open")
    
    db.add_all([org, role_dispatch, role_tech, dispatcher, tech1, wo1])
    db.commit()
    
    token = create_access_token({"sub": str(dispatcher.id), "org_id": str(org_id), "role_id": str(role_dispatch.id), "role": "dispatcher"})
    
    data = {
        "dispatcher_id": dispatcher.id,
        "tech1_id": tech1.id,
        "wo1_id": wo1.id,
        "token": token
    }
    
    db.close()
    yield data

@pytest.mark.anyio
async def test_concurrent_assignments(setup_db):
    data = setup_db
    headers = {"Authorization": f"Bearer {data['token']}"}
    
    payload = {
        "technician_id": str(data["tech1_id"]),
        "scheduled_start": "2026-10-01T09:00:00Z",
        "scheduled_end": "2026-10-01T11:00:00Z"
    }
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        # Fire two assignment requests at the exact same time
        req1 = client.post(f"/work-orders/{data['wo1_id']}/assign", json=payload, headers=headers)
        req2 = client.post(f"/work-orders/{data['wo1_id']}/assign", json=payload, headers=headers)
        
        responses = await asyncio.gather(req1, req2)
        
        status_codes = [r.status_code for r in responses]
        
        # Both might return 200 if they are exactly identical (idempotent)
        assert 200 in status_codes
        
    # Now check audit logs to ensure we didn't duplicate the assignment action
    db = TestingSessionLocal()
    from app.models import AuditEntry
    audit_logs = db.query(AuditEntry).filter(AuditEntry.entity_id == data["wo1_id"], AuditEntry.action == "assign_work_order").all()
    db.close()
    
    assert len(audit_logs) == 1, f"Expected 1 audit log, found {len(audit_logs)}"
