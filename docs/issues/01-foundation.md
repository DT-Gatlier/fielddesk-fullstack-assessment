## What to build

Setup the FastAPI and React scaffolding. Implement the PostgreSQL schema for Organisations, Users, and Roles with RLS policies enabled. Build the JWT generation login endpoint, the React login view, and wire up the basic auth context with Axios interceptors.

## Acceptance criteria

- [x] Docker Compose environment stands up FastAPI, React (Vite), Postgres, and Redis.
- [x] DB migrations exist for Organisations, Users, and Roles.
- [x] Row-Level Security (RLS) is active on these tables to enforce tenant isolation.
- [x] User can log in via the UI and receive a JWT.
- [x] Automated test proves cross-org data access is blocked at the database level.

## Blocked by

None - can start immediately
