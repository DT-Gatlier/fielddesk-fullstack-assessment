from app import models, database, auth
import uuid
from sqlalchemy.orm import Session
from sqlalchemy import text

def seed():
    db = database.SessionLocal()
    
    # Need to disable RLS for seeding because the db session has no org set
    db.execute(text("SET LOCAL row_security = OFF"))

    hashed_pw = auth.get_password_hash("password123")

    orgs_data = [
        {"name": "Demo Org", "prefix": "demo.com"},
        {"name": "Acme Corp", "prefix": "acme.com"}
    ]

    for org_info in orgs_data:
        org = db.query(models.Organisation).filter(models.Organisation.name == org_info["name"]).first()
        if not org:
            org = models.Organisation(name=org_info["name"])
            db.add(org)
            db.commit()
            db.refresh(org)
            print(f"Created org: {org.name}")

        # Create roles for org
        roles = {}
        for role_name in ["owner", "admin", "dispatcher", "technician"]:
            role = db.query(models.Role).filter(
                models.Role.organisation_id == org.id,
                models.Role.name == role_name
            ).first()
            if not role:
                role = models.Role(organisation_id=org.id, name=role_name)
                db.add(role)
                db.commit()
                db.refresh(role)
            roles[role_name] = role

        # Create users for org
        users_to_create = [
            {"email": f"owner@{org_info['prefix']}", "role_id": roles["owner"].id},
            {"email": f"admin@{org_info['prefix']}", "role_id": roles["admin"].id},
            {"email": f"dispatcher@{org_info['prefix']}", "role_id": roles["dispatcher"].id},
            {"email": f"technician@{org_info['prefix']}", "role_id": roles["technician"].id},
        ]

        for u_data in users_to_create:
            existing = db.query(models.User).filter(models.User.email == u_data["email"]).first()
            if not existing:
                user = models.User(
                    organisation_id=org.id,
                    email=u_data["email"],
                    hashed_password=hashed_pw,
                    role_id=u_data["role_id"]
                )
                db.add(user)
                print(f"Added {u_data['email']}")

    db.commit()
    print("Seeding complete! Passwords are all 'password123'")
    db.close()

if __name__ == "__main__":
    seed()
