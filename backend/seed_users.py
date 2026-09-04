from app import models, database, auth
import uuid

def seed():
    db = database.SessionLocal()
    
    # 1. Ensure 'beta' organisation exists or create one
    org = db.query(models.Organisation).filter(models.Organisation.name == 'beta').first()
    if not org:
        org = models.Organisation(name='beta')
        db.add(org)
        db.commit()
        db.refresh(org)
        print(f"Created org: {org.id}")
    else:
        print(f"Using org: {org.id}")

    # 2. Get roles
    tech_role = db.query(models.Role).filter(models.Role.name == 'technician').first()
    disp_role = db.query(models.Role).filter(models.Role.name == 'dispatcher').first()

    if not tech_role or not disp_role:
        print("Roles missing! Please run migrations/seed for roles first.")
        return

    # 3. Create users
    users_to_create = [
        {"email": "tech-1@beta.com", "role_id": tech_role.id},
        {"email": "tech-2@beta.com", "role_id": tech_role.id},
        {"email": "tech-3@beta.com", "role_id": tech_role.id},
        {"email": "dispatcher@beta.com", "role_id": disp_role.id},
    ]

    hashed_pw = auth.get_password_hash("password123")

    for u_data in users_to_create:
        existing = db.query(models.User).filter(models.User.email == u_data["email"]).first()
        if existing:
            print(f"User {u_data['email']} already exists. Updating password...")
            existing.hashed_password = hashed_pw
            existing.organisation_id = org.id
            existing.role_id = u_data["role_id"]
        else:
            user = models.User(
                organisation_id=org.id,
                email=u_data["email"],
                hashed_password=hashed_pw,
                role_id=u_data["role_id"]
            )
            db.add(user)
            print(f"Added {u_data['email']}")

    db.commit()
    print("Seeding complete!")

if __name__ == "__main__":
    seed()
