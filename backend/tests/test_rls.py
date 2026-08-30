import pytest
from sqlalchemy import text
from app.models import User, Organisation, RoleEnum
from app.database import SessionLocal
import uuid

@pytest.fixture(scope="module")
def db():
    # In a real test, this should use a test database and run migrations first
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_cross_org_access_blocked(db):
    # Bypass RLS to setup test data
    db.execute(text("SET LOCAL app.current_tenant_id = ''"))
    
    org1_id = uuid.uuid4()
    org2_id = uuid.uuid4()
    
    # Create two organisations
    org1 = Organisation(id=org1_id, name="Org 1")
    org2 = Organisation(id=org2_id, name="Org 2")
    db.add_all([org1, org2])
    db.commit()
    
    # Create a user in Org 2
    user2 = User(
        email="user2@org2.com",
        hashed_password="hashed_password",
        role=RoleEnum.dispatcher,
        organisation_id=org2_id
    )
    db.add(user2)
    db.commit()

    # Now, simulate a session for a user in Org 1
    # We set the tenant context to Org 1
    db.execute(text("SET LOCAL app.current_tenant_id = :org_id"), {"org_id": str(org1_id)})
    
    # Try to query users. We should NOT see user2
    users = db.query(User).all()
    
    # Check that user2 is not in the results
    assert not any(u.email == "user2@org2.com" for u in users), "RLS failed: Cross-org data access occurred"
    
    # Clean up (using a superuser/bypassing RLS)
    db.execute(text("RESET app.current_tenant_id"))
    db.delete(user2)
    db.delete(org1)
    db.delete(org2)
    db.commit()
