"""add assignment constraints

Revision ID: 003
Revises: 002
Create Date: 2026-08-31 08:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # enable btree_gist extension
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.add_column('work_orders', sa.Column('technician_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True))
    op.add_column('work_orders', sa.Column('scheduled_range', postgresql.TSTZRANGE, nullable=True))
    
    # Exclude constraint
    op.execute("""
        ALTER TABLE work_orders
        ADD CONSTRAINT no_overlapping_assignments
        EXCLUDE USING gist (
            technician_id WITH =,
            scheduled_range WITH &&
        )
        WHERE (technician_id IS NOT NULL AND scheduled_range IS NOT NULL AND status != 'cancelled');
    """)

def downgrade() -> None:
    op.drop_constraint('no_overlapping_assignments', 'work_orders')
    op.drop_column('work_orders', 'scheduled_range')
    op.drop_column('work_orders', 'technician_id')
