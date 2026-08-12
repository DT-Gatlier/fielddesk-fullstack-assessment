ALTER TABLE organisations
  ADD COLUMN timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX audit_entries_org_created_idx ON audit_entries (organisation_id, created_at DESC);
CREATE INDEX progress_events_org_created_idx ON progress_events (organisation_id, created_at DESC);
CREATE UNIQUE INDEX users_org_email_lower_uq ON users (organisation_id, lower(email));
CREATE UNIQUE INDEX employees_org_email_lower_uq ON employees (organisation_id, lower(email));

CREATE TABLE refresh_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organisation_id, user_id) REFERENCES users(organisation_id, id) ON DELETE CASCADE
);
CREATE INDEX refresh_sessions_user_idx ON refresh_sessions (organisation_id, user_id, expires_at) WHERE revoked_at IS NULL;
