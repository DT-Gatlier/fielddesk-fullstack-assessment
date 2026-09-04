from fastapi.testclient import TestClient
from app.main import app
from app import deps
from sqlalchemy.orm import Session
from app import models, database
from sqlalchemy import text
import uuid

def get_real_dispatcher(db: Session):
    return db.query(models.User).join(models.Role).filter(models.Role.name == 'dispatcher').first()

db = database.SessionLocal()
dispatcher = get_real_dispatcher(db)

if not dispatcher:
    print('No dispatcher found')
else:
    async def override_get_current_user():
        return dispatcher

    app.dependency_overrides[deps.get_current_user] = override_get_current_user
    app.dependency_overrides[deps.get_dispatcher_user] = override_get_current_user

    client = TestClient(app)
    wo_id = str(uuid.uuid4())
    org_id = str(dispatcher.organisation_id)
    db.execute(
        text("INSERT INTO work_orders (id, organisation_id, title, status) VALUES (:wo_id, :org_id, 'Test Assign WO', 'open')"),
        {'wo_id': wo_id, 'org_id': org_id}
    )
    
    tech = db.query(models.User).join(models.Role).filter(models.Role.name == 'technician', models.User.organisation_id == org_id).first()
    db.commit()
    
    res = client.post(
        f'/work-orders/{wo_id}/assign',
        json={
            'technician_id': str(tech.id),
            'scheduled_start': '2026-09-04T10:00:00Z',
            'scheduled_end': '2026-09-04T12:00:00Z'
        }
    )
    print(res.status_code)
    print(res.text)
