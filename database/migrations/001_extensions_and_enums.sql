-- Extensions required for UUID generation (Phase 1+)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Role enum for users
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('owner', 'dispatcher', 'technician');
  END IF;
END
$$;
