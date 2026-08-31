"""Add progress_events table

Revision ID: 004_progress_events
Revises: 003_add_assignment_constraints
Create Date: 2026-08-31 10:57:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid

# revision identifiers, used by Alembic.
revision = '004_progress_events'
down_revision = '003_add_assignment_constraints'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table('progress_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('event_id', sa.String(), nullable=False),
        sa.Column('work_order_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('status_from', sa.String(), nullable=False),
        sa.Column('status_to', sa.String(), nullable=False),
        sa.Column('technician_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['technician_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['work_order_id'], ['work_orders.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_progress_events_event_id'), 'progress_events', ['event_id'], unique=True)

def downgrade() -> None:
    op.drop_index(op.f('ix_progress_events_event_id'), table_name='progress_events')
    op.drop_table('progress_events')
