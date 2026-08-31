"""Add work orders

Revision ID: 002
Revises: 001
Create Date: 2026-08-31 08:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid
from datetime import datetime

# revision identifiers, used by Alembic.
revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Work Orders Table
    op.create_table(
        'work_orders',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organisations.id'), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='open'),
        sa.Column('assigned_to', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
    )

    # --- RLS Policies ---
    op.execute("ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE work_orders FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY work_order_isolation_policy ON work_orders
        USING (organisation_id = current_setting('app.current_organisation_id', true)::uuid);
    """)

def downgrade() -> None:
    op.execute("DROP POLICY work_order_isolation_policy ON work_orders")
    op.execute("ALTER TABLE work_orders DISABLE ROW LEVEL SECURITY")
    op.drop_table('work_orders')
