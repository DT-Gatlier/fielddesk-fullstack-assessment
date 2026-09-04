import pytest
import uuid
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.models import User, Organisation, Role, WorkOrder, Base
from app.main import app
from app.auth import get_password_hash, create_access_token

TEST_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db:5432/fielddesk")
engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    org1_id = uuid.uuid4()
    org2_id = uuid.uuid4()
    
    org1 = Organisation(id=org1_id, name="Concentric Corp")
    org2 = Organisation(id=org2_id, name="Initech")
    
    role1 = Role(id=uuid.uuid4(), organisation_id=org1_id, name="dispatcher")
    role2 = Role(id=uuid.uuid4(), organisation_id=org2_id, name="dispatcher")
    
    user1 = User(id=uuid.uuid4(), email=f"disp_{uuid.uuid4()}@conc.com", hashed_password=get_password_hash("pw"), role=role1, organisation_id=org1_id)
    user2 = User(id=uuid.uuid4(), email=f"disp_{uuid.uuid4()}@ini.com", hashed_password=get_password_hash("pw"), role=role2, organisation_id=org2_id)
    
    wo1 = WorkOrder(id=uuid.uuid4(), organisation_id=org1_id, title="Concentric Job", status="open")
    
    db.add_all([org1, org2, role1, role2, user1, user2, wo1])
    db.commit()
    
    token1 = create_access_token({"sub": str(user1.id), "org_id": str(org1_id), "role_id": str(role1.id), "role": "dispatcher"})
    token2 = create_access_token({"sub": str(user2.id), "org_id": str(org2_id), "role_id": str(role2.id), "role": "dispatcher"})
    
    data = {
        "org1_id": org1_id,
        "org2_id": org2_id,
        "user1_id": user1.id,
        "user2_id": user2.id,
        "wo1_id": wo1.id,
        "token1": token1,
        "token2": token2
    }
    
    db.close()
    yield data

def test_cross_org_access_blocked(setup_db):
    data = setup_db
    
    headers1 = {"Authorization": f"Bearer {data['token1']}"}
    headers2 = {"Authorization": f"Bearer {data['token2']}"}
    
    with TestClient(app) as client:
        # User 1 should see the work order
        response1 = client.get(f"/work-orders/{data['wo1_id']}", headers=headers1)
        assert response1.status_code == 200, "User 1 could not access their own work order"
        assert response1.json()["id"] == str(data['wo1_id'])
        
        # User 2 should NOT see User 1's work order
        response2 = client.get(f"/work-orders/{data['wo1_id']}", headers=headers2)
        assert response2.status_code == 404, "Cross-tenant leakage: User 2 accessed User 1's work order directly!"
        
        # User 2 fetching all work orders should not contain User 1's work order
        response_list = client.get("/work-orders", headers=headers2)
        assert response_list.status_code == 200
        wo_ids = [wo["id"] for wo in response_list.json()["data"]]
        assert str(data['wo1_id']) not in wo_ids, "Cross-tenant leakage: User 2 saw User 1's work order in the list!"
