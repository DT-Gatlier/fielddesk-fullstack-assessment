from fastapi.testclient import TestClient
from app.main import app
from app import deps
from sqlalchemy.orm import Session
from app import models, database
from sqlalchemy import text
import uuid

def test_unassign_work_order():
    db = database.SessionLocal()
    dispatcher = db.query(models.User).join(models.Role).filter(models.Role.name == 'dispatcher').first()
    
    async def override_get_current_user():
        return dispatcher

    app.dependency_overrides[deps.get_current_user] = override_get_current_user
    app.dependency_overrides[deps.get_dispatcher_user] = override_get_current_user

    client = TestClient(app)
    wo_id = str(uuid.uuid4())
    org_id = str(dispatcher.organisation_id)
    
    # Insert an ASSIGNED work order
    tech = db.query(models.User).join(models.Role).filter(models.Role.name == 'technician', models.User.organisation_id == org_id).first()
    db.execute(
        text("INSERT INTO work_orders (id, organisation_id, title, status, technician_id) VALUES (:wo_id, :org_id, 'Test Unassign WO', 'assigned', :tech_id)"),
        {'wo_id': wo_id, 'org_id': org_id, 'tech_id': str(tech.id)}
    )
    db.commit()
    
    # Call unassign
    res = client.post(f'/work-orders/{wo_id}/unassign')
    
    assert res.status_code == 200
    data = res.json()
    assert data['status'] == 'open'
    assert data['technician_id'] is None
    
    print("Test passed!")

if __name__ == '__main__':
    test_unassign_work_order()
