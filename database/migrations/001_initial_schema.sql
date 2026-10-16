-- FieldDesk initial schema.
-- Correctness rules that must hold across multiple API instances (no overlapping
-- assignments, one-time event processing, append-only audit records, storage
-- quota) are enforced here in PostgreSQL rather than in application memory.

CREATE EXTENSION IF NOT EXISTS btree_gist;  -- lets the exclusion constraint compare UUIDs with "="
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- trigram index for work-order search

-- Shared trigger functions -------------------------------------------------

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Append-only tables use this to reject UPDATE and DELETE for every client,
-- including anyone with direct database access through the application role.
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

-- Organisations ------------------------------------------------------------

CREATE TABLE organisations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  slug                text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,60}$'),
  storage_limit_bytes bigint NOT NULL CHECK (storage_limit_bytes >= 0),
  storage_used_bytes  bigint NOT NULL DEFAULT 0,
  work_order_seq      integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- Last line of defence for the quota: usage can never exceed the limit or go negative.
  CONSTRAINT storage_within_limit CHECK (storage_used_bytes >= 0 AND storage_used_bytes <= storage_limit_bytes)
);
CREATE TRIGGER organisations_updated_at BEFORE UPDATE ON organisations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Users --------------------------------------------------------------------

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  email         text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  role          text NOT NULL CHECK (role IN ('owner', 'dispatcher', 'technician')),
  password_hash text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Target for composite foreign keys: a row in another table can only point
  -- at a user from the same organisation.
  UNIQUE (org_id, id)
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));
CREATE INDEX users_org_role_idx ON users (org_id, role);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Sessions (server-side, so logout and deactivation take effect immediately) -

CREATE TABLE sessions (
  -- SHA-256 of the random session token. The raw token only exists in the cookie.
  token_hash   text PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  user_agent   text,
  ip           text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- Work orders --------------------------------------------------------------

CREATE TABLE work_orders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  reference          text NOT NULL,
  title              text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description        text NOT NULL DEFAULT '' CHECK (char_length(description) <= 5000),
  priority           text NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status             text NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'in_progress', 'on_hold', 'completed', 'cancelled')),
  site_name          text NOT NULL CHECK (char_length(site_name) BETWEEN 1 AND 200),
  technician_id      uuid,
  scheduled_start    timestamptz,
  scheduled_end      timestamptz,
  -- Incremented whenever the assigned technician changes; part of the
  -- notification de-duplication key.
  assignment_version integer NOT NULL DEFAULT 0,
  -- Optimistic-concurrency version for edits.
  version            integer NOT NULL DEFAULT 1,
  created_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  search_text        text GENERATED ALWAYS AS (lower(reference || ' ' || title || ' ' || site_name)) STORED,

  UNIQUE (org_id, reference),
  UNIQUE (org_id, id),
  -- Composite keys make cross-organisation references impossible even if
  -- application code forgot a WHERE clause.
  FOREIGN KEY (org_id, technician_id) REFERENCES users (org_id, id),
  FOREIGN KEY (org_id, created_by)    REFERENCES users (org_id, id),

  CONSTRAINT schedule_both_or_neither CHECK ((scheduled_start IS NULL) = (scheduled_end IS NULL)),
  CONSTRAINT schedule_end_after_start CHECK (scheduled_end > scheduled_start),
  CONSTRAINT technician_requires_schedule CHECK (technician_id IS NULL OR scheduled_start IS NOT NULL),

  -- THE scheduling guarantee: no two active work orders for the same technician
  -- may have overlapping [start, end) windows. PostgreSQL checks this atomically
  -- for every insert/update, including concurrent transactions from different
  -- API instances: the second conflicting transaction waits for the first and
  -- then fails with SQLSTATE 23P01 (exclusion_violation).
  CONSTRAINT work_orders_no_technician_overlap EXCLUDE USING gist (
    technician_id WITH =,
    tstzrange(scheduled_start, scheduled_end, '[)') WITH &&
  ) WHERE (technician_id IS NOT NULL AND status NOT IN ('completed', 'cancelled'))
);
CREATE INDEX work_orders_org_status_idx      ON work_orders (org_id, status);
CREATE INDEX work_orders_org_priority_idx    ON work_orders (org_id, priority);
CREATE INDEX work_orders_org_tech_start_idx  ON work_orders (org_id, technician_id, scheduled_start);
CREATE INDEX work_orders_org_start_idx       ON work_orders (org_id, scheduled_start);
CREATE INDEX work_orders_org_created_idx     ON work_orders (org_id, created_at DESC);
CREATE INDEX work_orders_org_updated_idx     ON work_orders (org_id, updated_at DESC);
CREATE INDEX work_orders_search_trgm_idx     ON work_orders USING gin (search_text gin_trgm_ops);
CREATE TRIGGER work_orders_updated_at BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Progress events (immutable record of every accepted technician event) ------

CREATE TABLE progress_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  -- Client-supplied idempotency key, unique per organisation.
  event_id        text NOT NULL CHECK (event_id ~ '^[A-Za-z0-9._:-]{1,100}$'),
  work_order_id   uuid NOT NULL,
  actor_id        uuid NOT NULL,
  type            text NOT NULL,
  occurred_at     timestamptz NOT NULL,
  payload         jsonb NOT NULL,
  -- SHA-256 of the canonical request, used to tell a genuine retry from an
  -- eventId being reused for different content.
  request_hash    text NOT NULL,
  -- Outcome stored with the event so duplicates replay the original response.
  result          jsonb NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, event_id),
  FOREIGN KEY (org_id, work_order_id) REFERENCES work_orders (org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, actor_id)      REFERENCES users (org_id, id)
);
CREATE INDEX progress_events_work_order_idx ON progress_events (work_order_id, occurred_at);
CREATE TRIGGER progress_events_append_only BEFORE UPDATE OR DELETE ON progress_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Attachments --------------------------------------------------------------

CREATE TABLE attachments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL,
  work_order_id     uuid NOT NULL,
  uploaded_by       uuid NOT NULL,
  -- Server-generated opaque key; never derived from the client filename.
  storage_key       text NOT NULL UNIQUE,
  original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 255),
  content_type      text NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  size_bytes        bigint NOT NULL CHECK (size_bytes > 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, work_order_id) REFERENCES work_orders (org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, uploaded_by)   REFERENCES users (org_id, id)
);
CREATE INDEX attachments_org_work_order_idx ON attachments (org_id, work_order_id);

-- Notifications (transactional outbox + delivery state) ---------------------

CREATE TABLE notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL,
  work_order_id       uuid NOT NULL,
  technician_id       uuid NOT NULL,
  -- One notification per (work order, assignment version). Inserted in the same
  -- transaction as the assignment, so a committed assignment always has exactly one.
  dedupe_key          text NOT NULL UNIQUE,
  recipient           text NOT NULL,
  subject             text NOT NULL,
  body                text NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'enqueued', 'retrying', 'delivered', 'failed')),
  attempts            integer NOT NULL DEFAULT 0,
  last_error          text,
  provider_message_id text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  enqueued_at         timestamptz,
  completed_at        timestamptz,
  FOREIGN KEY (org_id, work_order_id) REFERENCES work_orders (org_id, id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, technician_id) REFERENCES users (org_id, id)
);
CREATE INDEX notifications_pending_idx ON notifications (created_at) WHERE status = 'pending';
CREATE INDEX notifications_org_work_order_idx ON notifications (org_id, work_order_id);
CREATE TRIGGER notifications_updated_at BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE notification_attempts (
  id              bigserial PRIMARY KEY,
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  attempt_no      integer NOT NULL CHECK (attempt_no >= 1),
  outcome         text NOT NULL CHECK (outcome IN ('success', 'duplicate_suppressed', 'temporary_failure', 'permanent_failure')),
  error           text,
  duration_ms     integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, attempt_no)
);
CREATE TRIGGER notification_attempts_append_only BEFORE UPDATE OR DELETE ON notification_attempts
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Audit log (append-only) --------------------------------------------------

CREATE TABLE audit_log (
  id            bigserial PRIMARY KEY,
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  actor_type    text NOT NULL CHECK (actor_type IN ('user', 'system')),
  actor_id      uuid,
  action        text NOT NULL,
  target_type   text NOT NULL,
  target_id     uuid NOT NULL,
  work_order_id uuid,
  before        jsonb,
  after         jsonb,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((actor_type = 'user') = (actor_id IS NOT NULL))
);
CREATE INDEX audit_log_org_work_order_idx ON audit_log (org_id, work_order_id, created_at);
CREATE INDEX audit_log_org_created_idx ON audit_log (org_id, created_at DESC);
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
