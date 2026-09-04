"""Add location to work_orders

Revision ID: 009
Revises: 008
Create Date: 2026-09-03 14:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '009'
down_revision = '008'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('work_orders', sa.Column('location', sa.String(), nullable=True))


def downgrade():
    op.drop_column('work_orders', 'location')
