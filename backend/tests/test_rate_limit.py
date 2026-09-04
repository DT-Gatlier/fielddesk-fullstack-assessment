import pytest
import asyncio
from httpx import AsyncClient
import uuid
from app.main import app
from app.models import Organisation, Role, User, Base
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
    db.execute(text("SET LOCAL row_security = OFF"))
    
    org = Organisation(id=org_id, name="Test Org RL")
    role_owner = Role(organisation_id=org_id, name="owner")
    
    owner = User(email=f"owner_{uuid.uuid4()}@test.com", hashed_password=get_password_hash("pw"), role=role_owner, organisation_id=org_id)
    
    db.add_all([org, role_owner, owner])
    db.commit()
    db.refresh(owner)
    
    token = create_access_token({"sub": str(owner.id), "org_id": str(org_id), "role_id": str(role_owner.id)})
    
    yield {
        "token": token,
        "owner_id": owner.id,
        "org_id": str(org_id)
    }
    db.close()

@pytest.mark.asyncio
async def test_export_rate_limit(setup_db):
    data = setup_db
    token = data["token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        # We need to test the /work-orders/export endpoint.
        # It's not implemented yet, so let's hit it 5 times.
        # The first 4 should return 200 (or whatever export returns), the 5th should return 429.
        
        for i in range(4):
            resp = await client.get("/work-orders/export", headers=headers)
            # Either 200 or 500 if not implemented, but not 429
            assert resp.status_code != 429, f"Request {i+1} got rate limited too early!"
            
        resp = await client.get("/work-orders/export", headers=headers)
        assert resp.status_code == 429, "5th request was not rate limited!"
