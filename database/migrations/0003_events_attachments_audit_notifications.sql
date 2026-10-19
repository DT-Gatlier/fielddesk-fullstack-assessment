-- Progress events, attachments, audit log and notification tracking.

CREATE TABLE progress_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL,
  -- Client-supplied idempotency key. Unique per organisation: a duplicate submission hits this
  -- constraint, including when two identical requests race each other.
  event_id       text NOT NULL CHECK (length(event_id) BETWEEN 1 AND 128),
  work_order_id  uuid NOT NULL,
  submitted_by   uuid NOT NULL,
  type           text NOT NULL,
  occurred_at    timestamptz NOT NULL,
  payload        jsonb NOT NULL,
  -- Hash of the canonical request body, to tell a true retry from a conflicting reuse of an eventId.
  request_hash   text NOT NULL,
  -- 'applied' changed the work order; 'stale' arrived after a newer status event and was kept for the record only.
  outcome        text NOT NULL CHECK (outcome IN ('applied', 'stale')),
  received_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT progress_events_org_event_key UNIQUE (org_id, event_id),
  CONSTRAINT progress_events_work_order_fk FOREIGN KEY (org_id, work_order_id) REFERENCES work_orders (org_id, id),
  CONSTRAINT progress_events_submitter_fk FOREIGN KEY (org_id, submitted_by) REFERENCES users (org_id, id)
);

CREATE INDEX progress_events_work_order_idx ON progress_events (org_id, work_order_id, occurred_at);

CREATE TRIGGER progress_events_append_only BEFORE UPDATE OR DELETE ON progress_events
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TABLE attachments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL,
  work_order_id      uuid NOT NULL,
  uploaded_by        uuid NOT NULL,
  -- Server-generated key; the original filename is kept for display only and never used on disk.
  storage_key        text NOT NULL UNIQUE,
  original_filename  text NOT NULL CHECK (length(original_filename) BETWEEN 1 AND 255),
  content_type       text NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  size_bytes         bigint NOT NULL CHECK (size_bytes > 0),
  sha256             text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attachments_work_order_fk FOREIGN KEY (org_id, work_order_id) REFERENCES work_orders (org_id, id),
  CONSTRAINT attachments_uploader_fk FOREIGN KEY (org_id, uploaded_by) REFERENCES users (org_id, id)
);

CREATE INDEX attachments_work_order_idx ON attachments (org_id, work_order_id, created_at);

CREATE TABLE audit_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id       uuid NOT NULL REFERENCES organisations (id),
  actor_type   text NOT NULL CHECK (actor_type IN ('user', 'system')),
  actor_id     uuid,
  action       text NOT NULL,
  target_type  text NOT NULL,
  target_id    uuid,
  before       jsonb,
  after        jsonb,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_actor_chk CHECK ((actor_type = 'user') = (actor_id IS NOT NULL))
);

CREATE INDEX audit_log_target_idx ON audit_log (org_id, target_type, target_id, created_at);
CREATE INDEX audit_log_org_created_idx ON audit_log (org_id, created_at DESC);

CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');

CREATE TABLE notifications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL,
  work_order_id        uuid NOT NULL,
  technician_id        uuid NOT NULL,
  -- One notification per assignment (work order + technician + work-order version). Re-enqueuing
  -- the same assignment cannot create a second notification.
  dedupe_key           text NOT NULL,
  status               notification_status NOT NULL DEFAULT 'pending',
  attempts             integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error           text,
  provider_message_id  text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz,
  CONSTRAINT notifications_org_dedupe_key UNIQUE (org_id, dedupe_key),
  CONSTRAINT notifications_org_id_id_key UNIQUE (org_id, id),
  CONSTRAINT notifications_work_order_fk FOREIGN KEY (org_id, work_order_id) REFERENCES work_orders (org_id, id),
  CONSTRAINT notifications_technician_fk FOREIGN KEY (org_id, technician_id) REFERENCES users (org_id, id)
);

CREATE INDEX notifications_pending_idx ON notifications (created_at) WHERE status = 'pending';
CREATE INDEX notifications_work_order_idx ON notifications (org_id, work_order_id);

CREATE TRIGGER notifications_updated_at BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE notification_attempts (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id           uuid NOT NULL,
  notification_id  uuid NOT NULL,
  attempt_number   integer NOT NULL CHECK (attempt_number > 0),
  outcome          text NOT NULL CHECK (outcome IN ('success', 'temporary_failure', 'permanent_failure')),
  error            text,
  duration_ms      integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_attempts_notification_fk FOREIGN KEY (org_id, notification_id) REFERENCES notifications (org_id, id),
  CONSTRAINT notification_attempts_number_key UNIQUE (notification_id, attempt_number)
);

CREATE TRIGGER notification_attempts_append_only BEFORE UPDATE OR DELETE ON notification_attempts
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
