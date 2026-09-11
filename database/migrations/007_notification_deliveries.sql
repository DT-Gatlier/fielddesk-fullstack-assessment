DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_status') THEN
    CREATE TYPE notification_status AS ENUM (
      'pending',
      'sent',
      'failed_transient',
      'failed_permanent'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  work_order_id UUID NOT NULL REFERENCES work_orders(id),
  technician_id UUID NOT NULL REFERENCES users(id),
  assignment_version INT NOT NULL,
  status notification_status NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_deliveries_work_order_version_unique
    UNIQUE (work_order_id, assignment_version)
);

CREATE INDEX IF NOT EXISTS notification_deliveries_org_status_idx
  ON notification_deliveries (organisation_id, status);
