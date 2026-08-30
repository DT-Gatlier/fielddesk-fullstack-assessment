## What to build

Setup the FastAPI and React scaffolding. Implement the PostgreSQL schema for Organisations, Users, and Roles with RLS policies enabled. Build the JWT generation login endpoint, the React login view, and wire up the basic auth context with Axios interceptors.

## Acceptance criteria

- [ ] Docker Compose environment stands up FastAPI, React (Vite), Postgres, and Redis.
- [ ] DB migrations exist for Organisations, Users, and Roles.
- [ ] Row-Level Security (RLS) is active on these tables to enforce tenant isolation.
- [ ] User can log in via the UI and receive a JWT.
- [ ] Automated test proves cross-org data access is blocked at the database level.

## Blocked by

None - can start immediately
