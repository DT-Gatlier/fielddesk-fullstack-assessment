-- ==============================================================================
-- Migration 004: Scheduling Concurrency Constraints (GiST Exclusion)
-- ==============================================================================

-- Enable btree_gist extension for combining scalar equality (=) and range overlapping (&&)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prevent overlapping schedule windows for the same technician across all non-completed/non-cancelled work orders
-- The tstzrange represents [scheduled_start, scheduled_end)
ALTER TABLE work_orders
  ADD CONSTRAINT no_overlapping_technician_schedules
  EXCLUDE USING gist (
    assigned_technician_id WITH =,
    tstzrange(scheduled_start, scheduled_end, '[)') WITH &&
  )
  WHERE (
    assigned_technician_id IS NOT NULL 
    AND scheduled_start IS NOT NULL 
    AND scheduled_end IS NOT NULL
    AND status NOT IN ('cancelled', 'completed')
  );

