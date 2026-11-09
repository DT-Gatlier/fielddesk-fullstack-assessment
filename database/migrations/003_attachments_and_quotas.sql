-- ==============================================================================
-- Migration 003: Attachments & Storage Tracking
-- ==============================================================================

CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organisation_id VARCHAR(64) NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    original_filename VARCHAR(255) NOT NULL,
    storage_key VARCHAR(255) NOT NULL UNIQUE,
    mime_type VARCHAR(128) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_attachment_file_size CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760), -- Max 10MB
    CONSTRAINT chk_attachment_mime_type CHECK (
        mime_type IN ('image/jpeg', 'image/png', 'application/pdf')
    )
);

CREATE INDEX idx_attachments_work_order ON attachments(work_order_id);
CREATE INDEX idx_attachments_org ON attachments(organisation_id);

