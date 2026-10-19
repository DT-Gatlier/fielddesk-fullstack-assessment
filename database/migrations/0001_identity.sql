-- Organisations, users and sessions.

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Runtime privileges are granted to this group role; the login role used by the API is a member.
-- Normally created by database/init/01-roles.sh; created here too so migrations work on any server.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fielddesk_runtime') THEN
    CREATE ROLE fielddesk_runtime NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO fielddesk_runtime;

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- Used by append-only tables (audit log, progress events).
CREATE FUNCTION reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE TABLE organisations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  storage_limit_bytes  bigint NOT NULL DEFAULT 104857600 CHECK (storage_limit_bytes >= 0),
  storage_used_bytes   bigint NOT NULL DEFAULT 0 CHECK (storage_used_bytes >= 0),
  -- Per-organisation counter for human-readable work-order references (WO-000001).
  work_order_seq       integer NOT NULL DEFAULT 0 CHECK (work_order_seq >= 0),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER organisations_updated_at BEFORE UPDATE ON organisations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TYPE user_role AS ENUM ('owner', 'dispatcher', 'technician');

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organisations (id),
  email          text NOT NULL CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  role           user_role NOT NULL,
  password_hash  text NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Target for composite foreign keys, so child rows can only reference users in the same organisation.
  CONSTRAINT users_org_id_id_key UNIQUE (org_id, id)
);

-- Email is the login identifier, so it is unique across all organisations.
CREATE UNIQUE INDEX users_email_key ON users (email);
CREATE INDEX users_org_role_idx ON users (org_id, role);

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SHA-256 of the opaque cookie token; the token itself is never stored.
  token_hash  bytea NOT NULL UNIQUE,
  org_id      uuid NOT NULL,
  user_id     uuid NOT NULL,
  user_agent  text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  CONSTRAINT sessions_user_fk FOREIGN KEY (org_id, user_id) REFERENCES users (org_id, id) ON DELETE CASCADE,
  CONSTRAINT sessions_expiry_chk CHECK (expires_at > created_at)
);

CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- Login happens before the organisation is known, so the lookup by email cannot run under
-- the tenant RLS policy. These SECURITY DEFINER functions expose exactly the two lookups
-- authentication needs and nothing more.
CREATE FUNCTION auth_find_user_by_email(p_email text)
RETURNS TABLE (id uuid, org_id uuid, role user_role, name text, email text, password_hash text, is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id, u.org_id, u.role, u.name, u.email, u.password_hash, u.is_active
  FROM users u
  WHERE u.email = lower(p_email)
$$;

CREATE FUNCTION auth_resolve_session(p_token_hash bytea)
RETURNS TABLE (session_id uuid, user_id uuid, org_id uuid, role user_role, name text, email text, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, u.id, u.org_id, u.role, u.name, u.email, s.expires_at
  FROM sessions s
  JOIN users u ON u.id = s.user_id AND u.org_id = s.org_id
  WHERE s.token_hash = p_token_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
    AND u.is_active
$$;

REVOKE ALL ON FUNCTION auth_find_user_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_resolve_session(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_find_user_by_email(text) TO fielddesk_runtime;
GRANT EXECUTE ON FUNCTION auth_resolve_session(bytea) TO fielddesk_runtime;
