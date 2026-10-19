-- Work orders, including the database-level guarantee against overlapping technician assignments.

CREATE TYPE work_order_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE work_order_status AS ENUM ('open', 'scheduled', 'in_progress', 'on_hold', 'completed', 'cancelled');

CREATE TABLE work_orders (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organisations (id),
  reference               text NOT NULL,
  title                   text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description             text NOT NULL DEFAULT '' CHECK (length(description) <= 10000),
  priority                work_order_priority NOT NULL DEFAULT 'medium',
  status                  work_order_status NOT NULL DEFAULT 'open',
  site_name               text NOT NULL CHECK (length(btrim(site_name)) BETWEEN 1 AND 200),
  assigned_technician_id  uuid,
  scheduled_start         timestamptz,
  scheduled_end           timestamptz,
  created_by              uuid NOT NULL,
  -- Incremented on every update; used for optimistic concurrency on edits.
  version                 integer NOT NULL DEFAULT 1,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT work_orders_org_reference_key UNIQUE (org_id, reference),
  CONSTRAINT work_orders_org_id_id_key UNIQUE (org_id, id),
  -- Composite keys: a work order can only reference users from its own organisation.
  CONSTRAINT work_orders_technician_fk FOREIGN KEY (org_id, assigned_technician_id) REFERENCES users (org_id, id),
  CONSTRAINT work_orders_creator_fk FOREIGN KEY (org_id, created_by) REFERENCES users (org_id, id),
  CONSTRAINT work_orders_schedule_pair_chk CHECK ((scheduled_start IS NULL) = (scheduled_end IS NULL)),
  CONSTRAINT work_orders_schedule_order_chk CHECK (scheduled_end > scheduled_start),
  -- A technician cannot hold two active work orders whose windows overlap. Enforced by Postgres
  -- itself, so it holds across concurrent transactions and any number of API instances.
  -- Half-open ranges: back-to-back jobs (10:00-11:00, 11:00-12:00) are allowed.
  CONSTRAINT work_orders_no_technician_overlap EXCLUDE USING gist (
    assigned_technician_id WITH =,
    tstzrange(scheduled_start, scheduled_end, '[)') WITH &&
  ) WHERE (assigned_technician_id IS NOT NULL AND scheduled_start IS NOT NULL AND status <> 'cancelled')
);

CREATE TRIGGER work_orders_updated_at BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- List screen: default sort, filters and the technician's "my work" view.
CREATE INDEX work_orders_org_created_idx ON work_orders (org_id, created_at DESC, id DESC);
CREATE INDEX work_orders_org_status_idx ON work_orders (org_id, status);
CREATE INDEX work_orders_org_priority_idx ON work_orders (org_id, priority);
CREATE INDEX work_orders_org_technician_idx ON work_orders (org_id, assigned_technician_id, scheduled_start);
CREATE INDEX work_orders_org_schedule_idx ON work_orders (org_id, scheduled_start);
-- Free-text search over reference, title and site name (ILIKE '%term%').
CREATE INDEX work_orders_search_trgm_idx ON work_orders
  USING gin ((reference || ' ' || title || ' ' || site_name) gin_trgm_ops);
