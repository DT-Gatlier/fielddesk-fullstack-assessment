-- ==============================================================================
-- Migration 002: Processed Events (Idempotency) & Immutable Audit Logs
-- ==============================================================================

-- 1. Processed Events Table (Progress Events Idempotency & Deduplication)
CREATE TABLE processed_events (
    event_id VARCHAR(128) NOT NULL,
    organisation_id VARCHAR(64) NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organisation_id, event_id)
);

CREATE INDEX idx_processed_events_work_order ON processed_events(work_order_id);
CREATE INDEX idx_processed_events_org ON processed_events(organisation_id);

-- 2. Immutable Audit Logs Table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organisation_id VARCHAR(64) NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(128) NOT NULL,
    target_type VARCHAR(64) NOT NULL,
    target_id VARCHAR(128) NOT NULL,
    before_state JSONB,
    after_state JSONB,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_org_target ON audit_logs(organisation_id, target_type, target_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(organisation_id, created_at DESC);

