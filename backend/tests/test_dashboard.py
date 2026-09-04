import pytest
import asyncio
from httpx import AsyncClient
import uuid
from app.main import app
from app.models import Organisation, Role, User, Base
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.auth import get_password_hash, create_access_token
from unittest.mock import AsyncMock, patch

TEST_DATABASE_URL = "postgresql://fielddesk:securepassword@localhost:5432/fielddesk_test"
engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    org_id = uuid.uuid4()
    db.execute(text("SET LOCAL row_security = OFF"))
    
    org = Organisation(id=org_id, name="Test Org Dashboard")
    role_dispatch = Role(organisation_id=org_id, name="dispatcher")
    
    dispatcher = User(email=f"dispatch_{uuid.uuid4()}@test.com", hashed_password=get_password_hash("pw"), role=role_dispatch, organisation_id=org_id)
    
    db.add_all([org, role_dispatch, dispatcher])
    db.commit()
    db.refresh(dispatcher)
    
    token = create_access_token({"sub": str(dispatcher.id), "org_id": str(org_id), "role_id": str(role_dispatch.id)})
    
    yield {
        "token": token,
        "dispatcher_id": dispatcher.id,
        "org_id": str(org_id)
    }
    db.close()

@pytest.mark.asyncio
async def test_dashboard_events_emitted(setup_db):
    data = setup_db
    token = data["token"]
    org_id = data["org_id"]
    headers = {"Authorization": f"Bearer {token}"}
    
    with patch("app.main.sio.emit", new_callable=AsyncMock) as mock_emit:
        async with AsyncClient(app=app, base_url="http://test") as client:
            # Create work order
            payload = {
                "title": "New Work Order",
                "description": "Test"
            }
            resp = await client.post("/work-orders", json=payload, headers=headers)
            assert resp.status_code == 201
            wo_id = resp.json()["id"]
            
            # Since AsyncClient runs the ASGI app, BackgroundTasks might run concurrently.
            # We add a small sleep to allow the background task to execute.
            from unittest.mock import ANY
            await asyncio.sleep(0.1)
            mock_emit.assert_called_with('work_order_updated', ANY, room=f"org_{org_id}")
            
            mock_emit.reset_mock()
            
            # Update work order
            payload_update = {
                "status": "on_hold"
            }
            resp_update = await client.patch(f"/work-orders/{wo_id}", json=payload_update, headers=headers)
            assert resp_update.status_code == 200
            
            await asyncio.sleep(0.1)
            mock_emit.assert_called_with('work_order_updated', ANY, room=f"org_{org_id}")
