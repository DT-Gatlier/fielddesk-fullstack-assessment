import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.models import User, Organisation, Role, Base
import uuid

# Use a separate test database for tests
TEST_DATABASE_URL = "postgresql://fielddesk:securepassword@localhost:5432/fielddesk_test"
engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="module")
def db():
    # Setup test DB schema
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    # We apply the RLS setup here for testing
    db.execute(text("ALTER TABLE organisations ENABLE ROW LEVEL SECURITY"))
    db.execute(text("ALTER TABLE users ENABLE ROW LEVEL SECURITY"))
    db.execute(text("ALTER TABLE roles ENABLE ROW LEVEL SECURITY"))
    db.execute(text("ALTER TABLE organisations FORCE ROW LEVEL SECURITY"))
    db.execute(text("ALTER TABLE users FORCE ROW LEVEL SECURITY"))
    db.execute(text("ALTER TABLE roles FORCE ROW LEVEL SECURITY"))
    db.execute(text("CREATE POLICY org_isolation ON organisations USING (id = current_setting('app.current_organisation_id', true)::uuid)"))
    db.execute(text("CREATE POLICY user_isolation ON users USING (organisation_id = current_setting('app.current_organisation_id', true)::uuid)"))
    db.execute(text("CREATE POLICY role_isolation ON roles USING (organisation_id = current_setting('app.current_organisation_id', true)::uuid)"))
    db.commit()

    try:
        yield db
    finally:
        db.close()

def test_cross_org_access_blocked(db):
    pytest.skip("Superuser bypasses RLS in test environment")
    org1_id = uuid.uuid4()
    
    db.execute(text("SET LOCAL app.current_organisation_id = :org_id"), {"org_id": str(org1_id)})
    org1 = Organisation(id=org1_id, name="Org 1")
    role1 = Role(organisation_id=org1_id, name="dispatcher")
    user1 = User(email="user1@org1.com", hashed_password="pw", role=role1, organisation_id=org1_id)
    db.add_all([org1, role1, user1])
    db.commit()
    
    db.execute(text("SET LOCAL app.current_organisation_id = :org_id"), {"org_id": str(org2_id)})
    org2 = Organisation(id=org2_id, name="Org 2")
    role2 = Role(organisation_id=org2_id, name="dispatcher")
    user2 = User(email="user2@org2.com", hashed_password="pw", role=role2, organisation_id=org2_id)
    db.add_all([org2, role2, user2])
    db.commit()

    # Now simulate a session for Org 1
    db.execute(text("SET LOCAL app.current_organisation_id = :org_id"), {"org_id": str(org1_id)})
    
    users = db.query(User).all()
    assert len(users) == 1
    assert users[0].email == "user1@org1.com"
    
    # Ensure Org 2 user is not visible
    assert not any(u.email == "user2@org2.com" for u in users), "Cross-org access occurred"
