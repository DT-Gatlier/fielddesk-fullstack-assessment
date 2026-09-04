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

# We also need to mock get_dispatcher_user since the other endpoints might use it
async def override_get_dispatcher_user():
    return await override_get_current_user()

app.dependency_overrides[deps.get_dispatcher_user] = override_get_dispatcher_user
app.dependency_overrides[deps.get_owner_user] = override_get_dispatcher_user

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
    print(res.status_code, res.text[:100])
