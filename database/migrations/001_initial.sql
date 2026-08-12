CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('owner', 'dispatcher', 'technician');
CREATE TYPE work_order_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE work_order_status AS ENUM ('draft', 'scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE notification_status AS ENUM ('pending', 'processing', 'delivered', 'permanent_failure');

CREATE TABLE organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  storage_used_bytes bigint NOT NULL DEFAULT 0 CHECK (storage_used_bytes >= 0),
  storage_limit_bytes bigint NOT NULL DEFAULT 104857600 CHECK (storage_limit_bytes > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  role user_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  token_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, email),
  UNIQUE (organisation_id, id)
);
CREATE INDEX users_org_role_idx ON users (organisation_id, role) WHERE is_active;

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, code),
  UNIQUE (organisation_id, id)
);

CREATE TABLE employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  department_id uuid,
  name text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, email),
  UNIQUE (organisation_id, id),
  FOREIGN KEY (organisation_id, department_id) REFERENCES departments(organisation_id, id)
);
CREATE INDEX employees_org_department_idx ON employees (organisation_id, department_id);

CREATE TABLE work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  reference_number text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  priority work_order_priority NOT NULL DEFAULT 'medium',
  status work_order_status NOT NULL DEFAULT 'draft',
  assigned_technician_id uuid,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  site_name text NOT NULL,
  created_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, reference_number),
  UNIQUE (organisation_id, id),
  FOREIGN KEY (organisation_id, assigned_technician_id) REFERENCES users(organisation_id, id),
  FOREIGN KEY (organisation_id, created_by_id) REFERENCES users(organisation_id, id),
  CHECK ((scheduled_start IS NULL AND scheduled_end IS NULL) OR
         (scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL AND scheduled_start < scheduled_end)),
  CONSTRAINT technician_schedule_no_overlap EXCLUDE USING gist (
    organisation_id WITH =,
    assigned_technician_id WITH =,
    tstzrange(scheduled_start, scheduled_end, '[)') WITH &&
  ) WHERE (assigned_technician_id IS NOT NULL AND scheduled_start IS NOT NULL AND status <> 'cancelled')
);
CREATE INDEX work_orders_org_created_idx ON work_orders (organisation_id, created_at DESC);
CREATE INDEX work_orders_org_status_idx ON work_orders (organisation_id, status);
CREATE INDEX work_orders_org_technician_idx ON work_orders (organisation_id, assigned_technician_id, scheduled_start);
CREATE INDEX work_orders_search_idx ON work_orders USING gin (to_tsvector('simple', reference_number || ' ' || title || ' ' || site_name));

CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  work_order_id uuid NOT NULL,
  uploaded_by_id uuid NOT NULL,
  storage_key uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  original_name text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organisation_id, work_order_id) REFERENCES work_orders(organisation_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organisation_id, uploaded_by_id) REFERENCES users(organisation_id, id)
);
CREATE INDEX attachments_org_work_order_idx ON attachments (organisation_id, work_order_id, created_at);

CREATE TABLE progress_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  work_order_id uuid NOT NULL,
  submitted_by_id uuid NOT NULL,
  type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  accepted_request jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, event_id),
  FOREIGN KEY (organisation_id, work_order_id) REFERENCES work_orders(organisation_id, id),
  FOREIGN KEY (organisation_id, submitted_by_id) REFERENCES users(organisation_id, id)
);
CREATE INDEX progress_events_work_order_idx ON progress_events (organisation_id, work_order_id, occurred_at DESC);

CREATE TABLE audit_entries (
  id bigserial PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  actor_user_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organisation_id, actor_user_id) REFERENCES users(organisation_id, id)
);
CREATE INDEX audit_entries_target_idx ON audit_entries (organisation_id, target_type, target_id, created_at DESC);

CREATE TABLE notification_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  work_order_id uuid NOT NULL,
  technician_id uuid NOT NULL,
  deduplication_key text NOT NULL UNIQUE,
  status notification_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organisation_id, work_order_id) REFERENCES work_orders(organisation_id, id),
  FOREIGN KEY (organisation_id, technician_id) REFERENCES users(organisation_id, id)
);
CREATE INDEX notification_jobs_ready_idx ON notification_jobs (next_attempt_at) WHERE status = 'pending';

CREATE TABLE notification_attempts (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES notification_jobs(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('delivered', 'temporary_failure', 'permanent_failure')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
