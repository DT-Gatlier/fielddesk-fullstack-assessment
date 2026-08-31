import pytest
import asyncio
from httpx import AsyncClient
import uuid
from app.main import app
from app.models import Organisation, Role, User, WorkOrder, Base
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import datetime
from app.auth import get_password_hash, create_access_token

TEST_DATABASE_URL = "postgresql://fielddesk:securepassword@localhost:5432/fielddesk_test"
engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    # We must create the extension and add the constraint manually
    db.execute(text("CREATE EXTENSION IF NOT EXISTS btree_gist;"))
    db.execute(text("""
        ALTER TABLE work_orders 
        DROP CONSTRAINT IF EXISTS no_overlapping_assignments;
    """))
    try:
        db.execute(text("""
            ALTER TABLE work_orders
            ADD CONSTRAINT no_overlapping_assignments
            EXCLUDE USING gist (
                technician_id WITH =,
                scheduled_time WITH &&
            )
            WHERE (technician_id IS NOT NULL AND scheduled_time IS NOT NULL AND status != 'cancelled');
        """))
    except Exception:
        db.rollback()
    
    db.commit()
    
    org_id = uuid.uuid4()
    # bypass RLS for setup
    db.execute(text("SET LOCAL row_security = OFF"))
    
    org = Organisation(id=org_id, name="Test Org")
    role_disp = Role(organisation_id=org_id, name="dispatcher")
    role_tech = Role(organisation_id=org_id, name="technician")
    
    dispatcher = User(email=f"disp_{uuid.uuid4()}@test.com", hashed_password=get_password_hash("pw"), role=role_disp, organisation_id=org_id)
    tech = User(email=f"tech_{uuid.uuid4()}@test.com", hashed_password=get_password_hash("pw"), role=role_tech, organisation_id=org_id)
    
    db.add_all([org, role_disp, role_tech, dispatcher, tech])
    db.commit()
    db.refresh(dispatcher)
    db.refresh(tech)
    
    # create two work orders
    wo1 = WorkOrder(organisation_id=org_id, title="WO 1")
    wo2 = WorkOrder(organisation_id=org_id, title="WO 2")
    db.add_all([wo1, wo2])
    db.commit()
    db.refresh(wo1)
    db.refresh(wo2)
    
    token = create_access_token({"sub": str(dispatcher.id), "org_id": str(org_id), "role_id": str(role_disp.id)})
    
    yield {
        "token": token,
        "tech_id": tech.id,
        "wo1_id": wo1.id,
        "wo2_id": wo2.id
    }
    db.close()

@pytest.mark.asyncio
async def test_concurrent_assignments(setup_db):
    data = setup_db
    token = data["token"]
    tech_id = data["tech_id"]
    wo1_id = data["wo1_id"]
    wo2_id = data["wo2_id"]
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Assign same technician to same time slot for different work orders
    # This should fail due to gist exclusion constraint
    payload1 = {
        "technician_id": str(tech_id),
        "scheduled_start": "2026-09-01T10:00:00Z",
        "scheduled_end": "2026-09-01T12:00:00Z"
    }
    payload2 = {
        "technician_id": str(tech_id),
        "scheduled_start": "2026-09-01T11:00:00Z", # overlaps
        "scheduled_end": "2026-09-01T13:00:00Z"
    }

    async with AsyncClient(app=app, base_url="http://test") as client:
        req1 = client.post(f"/work-orders/{wo1_id}/assign", json=payload1, headers=headers)
        req2 = client.post(f"/work-orders/{wo2_id}/assign", json=payload2, headers=headers)
        
        responses = await asyncio.gather(req1, req2)
        
        status_codes = [r.status_code for r in responses]
        
        assert 200 in status_codes
        assert 409 in status_codes
