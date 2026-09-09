DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'progress_event_type') THEN
    CREATE TYPE progress_event_type AS ENUM ('status_changed', 'note_added');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS progress_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id),
  work_order_id UUID NOT NULL REFERENCES work_orders(id),
  submitted_by_user_id UUID NOT NULL REFERENCES users(id),
  event_id TEXT NOT NULL,
  event_type progress_event_type NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT progress_events_event_id_unique UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS progress_events_work_order_occurred_idx
  ON progress_events (work_order_id, occurred_at);
