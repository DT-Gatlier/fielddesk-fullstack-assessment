import pytest
import asyncio
from httpx import AsyncClient
import uuid
from app.main import app
from app.models import Organisation, Role, User, WorkOrder, Base
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.auth import get_password_hash, create_access_token

TEST_DATABASE_URL = "postgresql://fielddesk:securepassword@localhost:5432/fielddesk_test"
engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    org_id = uuid.uuid4()
    # bypass RLS for setup
    db.execute(text("SET LOCAL row_security = OFF"))
    
    org = Organisation(id=org_id, name="Test Org 2")
    role_tech = Role(organisation_id=org_id, name="technician")
    
    tech = User(email=f"tech2_{uuid.uuid4()}@test.com", hashed_password=get_password_hash("pw"), role=role_tech, organisation_id=org_id)
    
    db.add_all([org, role_tech, tech])
    db.commit()
    db.refresh(tech)
    
    wo1 = WorkOrder(organisation_id=org_id, title="WO 1", status="assigned", technician_id=tech.id)
    wo2 = WorkOrder(organisation_id=org_id, title="WO 2", status="assigned", technician_id=tech.id)
    db.add_all([wo1, wo2])
    db.commit()
    db.refresh(wo1)
    db.refresh(wo2)
    
    token = create_access_token({"sub": str(tech.id), "org_id": str(org_id), "role_id": str(role_tech.id)})
    
    yield {
        "token": token,
        "tech_id": tech.id,
        "wo1_id": wo1.id,
        "wo2_id": wo2.id
    }
    db.close()

@pytest.mark.asyncio
async def test_progress_events(setup_db):
    data = setup_db
    token = data["token"]
    wo1_id = data["wo1_id"]
    wo2_id = data["wo2_id"]
    
    headers = {"Authorization": f"Bearer {token}"}
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        event_id = str(uuid.uuid4())
        payload = {
            "event_id": event_id,
            "status_to": "in_progress"
        }
        
        # 1. Normal submission
        resp1 = await client.post(f"/work-orders/{wo1_id}/progress", json=payload, headers=headers)
        assert resp1.status_code == 200
        assert resp1.json()["status_from"] == "assigned"
        assert resp1.json()["status_to"] == "in_progress"
        
        # 2. Duplicate submission (Idempotency)
        resp2 = await client.post(f"/work-orders/{wo1_id}/progress", json=payload, headers=headers)
        assert resp2.status_code == 200
        assert resp2.json()["id"] == resp1.json()["id"] # Same event returned
        
        # 3. Validation: transition to open
        payload_open = {
            "event_id": str(uuid.uuid4()),
            "status_to": "open"
        }
        resp3 = await client.post(f"/work-orders/{wo1_id}/progress", json=payload_open, headers=headers)
        assert resp3.status_code == 400
        assert "Cannot transition from" in resp3.json()["error"]
        
        # 4. Concurrent submission
        concurrent_event_id = str(uuid.uuid4())
        payload_concurrent = {
            "event_id": concurrent_event_id,
            "status_to": "completed"
        }
        
        req1 = client.post(f"/work-orders/{wo1_id}/progress", json=payload_concurrent, headers=headers)
        req2 = client.post(f"/work-orders/{wo1_id}/progress", json=payload_concurrent, headers=headers)
        
        responses = await asyncio.gather(req1, req2)
        status_codes = [r.status_code for r in responses]
        
        # Both should be 200 due to idempotency handling
        assert status_codes == [200, 200]
        
        # 5. Validation: terminal status
        payload_after_terminal = {
            "event_id": str(uuid.uuid4()),
            "status_to": "completed"
        }
        # Assuming wo1 is now completed because of step 4
        resp5 = await client.post(f"/work-orders/{wo1_id}/progress", json=payload_after_terminal, headers=headers)
        assert resp5.status_code == 400
        assert "Cannot transition from completed" in resp5.json()["error"]
