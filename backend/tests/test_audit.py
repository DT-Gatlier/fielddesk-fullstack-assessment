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

app.dependency_overrides[deps.get_db] = override_get_db


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

