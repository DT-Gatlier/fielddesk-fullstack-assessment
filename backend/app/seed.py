import os
import uuid
from datetime import datetime, timedelta
from psycopg2.extras import DateTimeTZRange

from .database import SessionLocal, engine, Base
from . import models, auth

def seed_db():
    print("Seeding database...")
    db = SessionLocal()
    try:
        # Check if already seeded
        existing_org = db.query(models.Organisation).filter(models.Organisation.name == "Demo Org").first()
        if existing_org:
            print("Database already seeded. Skipping.")
            return

        # Create Org
        org = models.Organisation(name="Demo Org")
        db.add(org)
        db.flush()

        # Create Roles
        owner_role = models.Role(organisation_id=org.id, name="owner")
        dispatcher_role = models.Role(organisation_id=org.id, name="dispatcher")
        tech_role = models.Role(organisation_id=org.id, name="technician")
        db.add_all([owner_role, dispatcher_role, tech_role])
        db.flush()

        # Create Users
        password_hash = auth.get_password_hash("password123")
        
        owner = models.User(
            organisation_id=org.id,
            email="owner@demo.com",
            hashed_password=password_hash,
            role_id=owner_role.id
        )
        
        dispatcher = models.User(
            organisation_id=org.id,
            email="dispatcher@demo.com",
            hashed_password=password_hash,
            role_id=dispatcher_role.id
        )
        
        tech1 = models.User(
            organisation_id=org.id,
            email="tech1@demo.com",
            hashed_password=password_hash,
            role_id=tech_role.id
        )
        
        tech2 = models.User(
            organisation_id=org.id,
            email="tech2@demo.com",
            hashed_password=password_hash,
            role_id=tech_role.id
        )
        
        db.add_all([owner, dispatcher, tech1, tech2])
        db.flush()

        # Create Work Orders
        now = datetime.utcnow()
        wo1 = models.WorkOrder(
            organisation_id=org.id,
            title="Fix AC Unit",
            description="AC unit is leaking water",
            status="assigned",
            technician_id=tech1.id,
            scheduled_range=DateTimeTZRange(now, now + timedelta(hours=2), '[)')
        )
        
        wo2 = models.WorkOrder(
            organisation_id=org.id,
            title="Inspect Generator",
            description="Routine maintenance",
            status="open"
        )
        
        wo3 = models.WorkOrder(
            organisation_id=org.id,
            title="Repair Transformer",
            description="High priority issue",
            status="assigned",
            technician_id=tech2.id,
            scheduled_range=DateTimeTZRange(now + timedelta(hours=1), now + timedelta(hours=4), '[)')
        )
        
        db.add_all([wo1, wo2, wo3])
        db.commit()
        print("Database seeded successfully with Demo Org, 4 users, and 3 work orders.")
        print("Login with e.g. dispatcher@demo.com / password123")
        
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_db()
