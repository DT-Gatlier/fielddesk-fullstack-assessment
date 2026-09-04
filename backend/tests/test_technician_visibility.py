import pytest
import asyncio
from httpx import AsyncClient
import uuid
from app.main import app
from app.models import Organisation, Role, User, WorkOrder, Base
from sqlalchemy import create_engine, text
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
    org = Organisation(id=org_id, name="Visibility Test Org")
    role_tech = Role(id=uuid.uuid4(), organisation_id=org_id, name="technician")
    
    tech1 = User(id=uuid.uuid4(), email=f"tech1_{uuid.uuid4()}@vis.com", hashed_password=get_password_hash("test"), role=role_tech, organisation_id=org_id)
    tech2 = User(id=uuid.uuid4(), email=f"tech2_{uuid.uuid4()}@vis.com", hashed_password=get_password_hash("test"), role=role_tech, organisation_id=org_id)
    
    wo1 = WorkOrder(id=uuid.uuid4(), organisation_id=org_id, title="Tech 1 Job", technician_id=tech1.id, status="assigned")
    wo_unassigned = WorkOrder(id=uuid.uuid4(), organisation_id=org_id, title="Unassigned Job", status="open")
    
    db.add_all([org, role_tech, tech1, tech2, wo1, wo_unassigned])
    db.commit()
    
    token1 = create_access_token({"sub": str(tech1.id), "org_id": str(org_id), "role_id": str(role_tech.id), "role": "technician"})
    token2 = create_access_token({"sub": str(tech2.id), "org_id": str(org_id), "role_id": str(role_tech.id), "role": "technician"})
    
    data = {
        "tech1_id": tech1.id,
        "tech2_id": tech2.id,
        "wo1_id": wo1.id,
        "wo_unassigned_id": wo_unassigned.id,
        "token1": token1,
        "token2": token2
    }
    
    db.close()
    yield data

from fastapi.testclient import TestClient

def test_technician_can_only_see_own_or_unassigned_work_orders(setup_db):
    data = setup_db
    
    headers2 = {"Authorization": f"Bearer {data['token2']}"}
    
    with TestClient(app) as client:
        # Tech 2 requests all work orders
        response = client.get("/work-orders", headers=headers2)
        assert response.status_code == 200
        response_data = response.json()["data"]
        
        # Tech 2 should NOT see Tech 1's work order
        wo_ids = [wo["id"] for wo in response_data]
        assert str(data["wo1_id"]) not in wo_ids, "Tech 2 saw Tech 1's work order in the list!"
        
        # Tech 2 fetching Tech 1's specific work order should 404
        single_response = client.get(f"/work-orders/{data['wo1_id']}", headers=headers2)
        assert single_response.status_code == 404, "Tech 2 could fetch Tech 1's work order directly!"
