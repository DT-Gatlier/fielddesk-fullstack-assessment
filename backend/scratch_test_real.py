from fastapi.testclient import TestClient
from app.main import app
from app import deps
from sqlalchemy.orm import Session
from app import models, database

def get_real_dispatcher(db: Session):
    return db.query(models.User).join(models.Role).filter(models.Role.name == 'dispatcher').first()

db = database.SessionLocal()
dispatcher = get_real_dispatcher(db)
db.close()

if not dispatcher:
    print("No dispatcher found in DB!")
else:
    async def override_get_current_user():
        return dispatcher

    app.dependency_overrides[deps.get_current_user] = override_get_current_user
    app.dependency_overrides[deps.get_dispatcher_user] = override_get_current_user
    app.dependency_overrides[deps.get_owner_user] = override_get_current_user

    client = TestClient(app)
    endpoints = [
        '/work-orders?status=open&pageSize=1',
        '/work-orders?status=completed&pageSize=1',
        '/organisation/quota',
        '/users'
    ]

    for ep in endpoints:
        print(f"Testing {ep}")
        res = client.get(ep)
        print(res.status_code)
        if res.status_code >= 400:
            print(res.text)
