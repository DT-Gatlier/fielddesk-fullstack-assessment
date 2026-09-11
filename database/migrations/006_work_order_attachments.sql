CREATE TABLE IF NOT EXISTS work_order_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  uploaded_by_user_id UUID NOT NULL REFERENCES users(id),
  storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_order_attachments_storage_key_unique UNIQUE (storage_key)
);

CREATE INDEX IF NOT EXISTS work_order_attachments_work_order_id_idx
  ON work_order_attachments (work_order_id);

CREATE INDEX IF NOT EXISTS work_order_attachments_organisation_id_idx
  ON work_order_attachments (organisation_id);
