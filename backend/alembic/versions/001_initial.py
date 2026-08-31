"""initial

Revision ID: 001
Revises: 
Create Date: 2026-08-30 22:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid
from datetime import datetime
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Organisations Table
    orgs_table = op.create_table(
        'organisations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    
    # Roles Table
    roles_table = op.create_table(
        'roles',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
    )

    # Users Table
    users_table = op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id'), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('role_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('roles.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    
    # --- RLS Policies ---
    op.execute("ALTER TABLE organisations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE roles ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE users ENABLE ROW LEVEL SECURITY")

    op.execute("ALTER TABLE organisations FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE roles FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE users FORCE ROW LEVEL SECURITY")
    
    op.execute("""
        CREATE POLICY org_isolation_policy ON organisations
        USING (id = current_setting('app.current_organisation_id', true)::uuid);
    """)
    op.execute("""
        CREATE POLICY role_isolation_policy ON roles
        USING (organisation_id = current_setting('app.current_organisation_id', true)::uuid);
    """)
    op.execute("""
        CREATE POLICY user_isolation_policy ON users
        USING (organisation_id = current_setting('app.current_organisation_id', true)::uuid);
    """)

    # Seed data
    org1_id = uuid.uuid4()
    org2_id = uuid.uuid4()
    
    # Insert orgs bypass RLS (since we are creating them, we need to temporarily disable or set it)
    op.execute("ALTER TABLE organisations DISABLE ROW LEVEL SECURITY")
    op.bulk_insert(orgs_table, [
        {"id": org1_id, "name": "Alpha Maintenance", "created_at": datetime.utcnow()},
        {"id": org2_id, "name": "Beta Repairs", "created_at": datetime.utcnow()}
    ])
    op.execute("ALTER TABLE organisations ENABLE ROW LEVEL SECURITY")
    
    # Roles
    role_o1_owner = uuid.uuid4()
    role_o1_dispatcher = uuid.uuid4()
    role_o1_tech = uuid.uuid4()
    role_o2_owner = uuid.uuid4()
    role_o2_dispatcher = uuid.uuid4()
    role_o2_tech = uuid.uuid4()
    
    op.execute("ALTER TABLE roles DISABLE ROW LEVEL SECURITY")
    op.bulk_insert(roles_table, [
        {"id": role_o1_owner, "organisation_id": org1_id, "name": "owner"},
        {"id": role_o1_dispatcher, "organisation_id": org1_id, "name": "dispatcher"},
        {"id": role_o1_tech, "organisation_id": org1_id, "name": "technician"},
        {"id": role_o2_owner, "organisation_id": org2_id, "name": "owner"},
        {"id": role_o2_dispatcher, "organisation_id": org2_id, "name": "dispatcher"},
        {"id": role_o2_tech, "organisation_id": org2_id, "name": "technician"}
    ])
    op.execute("ALTER TABLE roles ENABLE ROW LEVEL SECURITY")

    # Users
    hashed_pw = pwd_context.hash("password123")
    op.execute("ALTER TABLE users DISABLE ROW LEVEL SECURITY")
    op.bulk_insert(users_table, [
        {"id": uuid.uuid4(), "organisation_id": org1_id, "email": "owner@alpha.com", "hashed_password": hashed_pw, "role_id": role_o1_owner, "created_at": datetime.utcnow()},
        {"id": uuid.uuid4(), "organisation_id": org1_id, "email": "dispatcher@alpha.com", "hashed_password": hashed_pw, "role_id": role_o1_dispatcher, "created_at": datetime.utcnow()},
        {"id": uuid.uuid4(), "organisation_id": org1_id, "email": "tech@alpha.com", "hashed_password": hashed_pw, "role_id": role_o1_tech, "created_at": datetime.utcnow()},
        {"id": uuid.uuid4(), "organisation_id": org2_id, "email": "owner@beta.com", "hashed_password": hashed_pw, "role_id": role_o2_owner, "created_at": datetime.utcnow()},
        {"id": uuid.uuid4(), "organisation_id": org2_id, "email": "dispatcher@beta.com", "hashed_password": hashed_pw, "role_id": role_o2_dispatcher, "created_at": datetime.utcnow()},
        {"id": uuid.uuid4(), "organisation_id": org2_id, "email": "tech@beta.com", "hashed_password": hashed_pw, "role_id": role_o2_tech, "created_at": datetime.utcnow()}
    ])
    op.execute("ALTER TABLE users ENABLE ROW LEVEL SECURITY")

def downgrade() -> None:
    op.execute("DROP POLICY user_isolation_policy ON users")
    op.execute("DROP POLICY role_isolation_policy ON roles")
    op.execute("DROP POLICY org_isolation_policy ON organisations")
    op.execute("ALTER TABLE users DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE roles DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE organisations DISABLE ROW LEVEL SECURITY")
    op.drop_index('ix_users_email', table_name='users')
    op.drop_table('users')
    op.drop_table('roles')
    op.drop_table('organisations')
