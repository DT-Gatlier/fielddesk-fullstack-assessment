-- Enable GiST indexing for range overlap checks
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Resolve existing overlapping assignments before adding the constraint
DO $$
DECLARE
  affected INTEGER;
BEGIN
  LOOP
    WITH overlapping AS (
      SELECT wo.id
      FROM work_orders wo
      INNER JOIN work_orders other
        ON wo.assigned_technician_id = other.assigned_technician_id
       AND wo.id <> other.id
       AND wo.status NOT IN ('cancelled')
       AND other.status NOT IN ('cancelled')
       AND wo.scheduled_start IS NOT NULL
       AND wo.scheduled_end IS NOT NULL
       AND other.scheduled_start IS NOT NULL
       AND other.scheduled_end IS NOT NULL
       AND tstzrange(wo.scheduled_start, wo.scheduled_end, '[)')
           && tstzrange(other.scheduled_start, other.scheduled_end, '[)')
       AND (wo.created_at, wo.id) > (other.created_at, other.id)
    )
    UPDATE work_orders
    SET assigned_technician_id = NULL,
        scheduled_start = NULL,
        scheduled_end = NULL,
        status = 'draft'
    WHERE id IN (SELECT id FROM overlapping);

    GET DIAGNOSTICS affected = ROW_COUNT;
    EXIT WHEN affected = 0;
  END LOOP;
END $$;

ALTER TABLE work_orders
  DROP CONSTRAINT IF EXISTS work_orders_no_overlap;

ALTER TABLE work_orders
  ADD CONSTRAINT work_orders_no_overlap
  EXCLUDE USING gist (
    assigned_technician_id WITH =,
    tstzrange(scheduled_start, scheduled_end, '[)') WITH &&
  )
  WHERE (
    assigned_technician_id IS NOT NULL
    AND status NOT IN ('cancelled')
    AND scheduled_start IS NOT NULL
    AND scheduled_end IS NOT NULL
  );
