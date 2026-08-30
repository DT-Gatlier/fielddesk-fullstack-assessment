"""initial

Revision ID: 001
Revises: 
Create Date: 2026-08-30 22:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Organisations Table
    op.create_table(
        'organisations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    
    # Create enum for roles
    op.execute("CREATE TYPE roleenum AS ENUM ('owner', 'dispatcher', 'technician')")

    # Users Table
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id'), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('role', postgresql.ENUM('owner', 'dispatcher', 'technician', name='roleenum', create_type=False), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    
    # --- RLS Policies ---
    # Enable RLS
    op.execute("ALTER TABLE organisations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE users ENABLE ROW LEVEL SECURITY")

    # Force RLS even for owners (important so that backend service role is restricted too, unless BYPASSRLS is used)
    op.execute("ALTER TABLE organisations FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE users FORCE ROW LEVEL SECURITY")
    
    # Policies for organisations: Can only see their own org
    op.execute("""
        CREATE POLICY tenant_isolation_policy ON organisations
        USING (id = current_setting('app.current_tenant_id', true)::uuid);
    """)

    # Policies for users: Can only see users in their org
    op.execute("""
        CREATE POLICY tenant_isolation_policy ON users
        USING (organisation_id = current_setting('app.current_tenant_id', true)::uuid);
    """)

def downgrade() -> None:
    op.execute("DROP POLICY tenant_isolation_policy ON users")
    op.execute("DROP POLICY tenant_isolation_policy ON organisations")
    op.execute("ALTER TABLE users DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE organisations DISABLE ROW LEVEL SECURITY")
    op.drop_index('ix_users_email', table_name='users')
    op.drop_table('users')
    op.execute("DROP TYPE roleenum")
    op.drop_table('organisations')
