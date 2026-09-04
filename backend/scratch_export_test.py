from fastapi.testclient import TestClient
from app.main import app
from app import database, models, deps

def test_export():
    db = database.SessionLocal()
    owner = db.query(models.User).join(models.Role).filter(models.Role.name == 'owner').first()
    
    async def override_get_owner_user():
        return owner
        
    app.dependency_overrides[deps.get_owner_user] = override_get_owner_user
    app.dependency_overrides[deps.get_rls_db] = lambda: db

    client = TestClient(app)
    # The endpoint has rate limiting (4/minute), so just call it once
    res = client.get("/work-orders/export")
    
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    content = res.content.decode("utf-8")
    assert "ID,Title,Description" in content
    
    print("Export CSV endpoint is working properly!")
    print(content[:500])

if __name__ == "__main__":
    test_export()
