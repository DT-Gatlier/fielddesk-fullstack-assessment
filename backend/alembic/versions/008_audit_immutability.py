from alembic import op

revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.execute("""
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit records are strictly append-only and immutable.';
END;
$$ LANGUAGE plpgsql;
    """)

    op.execute("""
CREATE TRIGGER audit_logs_immutable_trigger
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
    """)

def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_logs_immutable_trigger ON audit_logs;")
    op.execute("DROP FUNCTION IF EXISTS prevent_audit_modification();")
