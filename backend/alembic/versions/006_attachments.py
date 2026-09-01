from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Add storage tracking to organisations
    op.add_column('organisations', sa.Column('storage_used_bytes', sa.BigInteger(), nullable=False, server_default='0'))
    op.add_column('organisations', sa.Column('storage_quota_bytes', sa.BigInteger(), nullable=False, server_default='104857600'))

    # Create attachments table
    op.create_table(
        'attachments',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('work_order_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('file_name', sa.String(), nullable=False),
        sa.Column('file_path', sa.String(), nullable=False),
        sa.Column('file_size', sa.BigInteger(), nullable=False),
        sa.Column('content_type', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['organisation_id'], ['organisations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['work_order_id'], ['work_orders.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    op.execute("ALTER TABLE attachments ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE attachments FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY attachment_isolation_policy ON attachments
        USING (organisation_id = current_setting('app.current_organisation_id', true)::uuid);
    """)

def downgrade() -> None:
    op.execute("DROP POLICY attachment_isolation_policy ON attachments")
    op.execute("ALTER TABLE attachments DISABLE ROW LEVEL SECURITY")
    op.drop_table('attachments')
    op.drop_column('organisations', 'storage_quota_bytes')
    op.drop_column('organisations', 'storage_used_bytes')
