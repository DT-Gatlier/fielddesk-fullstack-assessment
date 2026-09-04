from fastapi.testclient import TestClient
from app.main import app
from app import deps

async def override_get_current_user():
    class DummyUser:
        id = '00000000-0000-0000-0000-000000000000'
        organisation_id = '00000000-0000-0000-0000-000000000000'
        role_id = '00000000-0000-0000-0000-000000000000'
    return DummyUser()

app.dependency_overrides[deps.get_current_user] = override_get_current_user

client = TestClient(app)
response = client.get('/work-orders?status=open&pageSize=1')
print(response.status_code)
print(response.text)
