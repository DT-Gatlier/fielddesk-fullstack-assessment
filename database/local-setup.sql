-- Local (non-Docker) setup: mirrors database/init/01-roles.sh for a Postgres you run yourself.
-- Run once as a superuser, e.g.:
--   psql -h localhost -p 5432 -U postgres -f database/local-setup.sql
-- Then point DATABASE_URL / MIGRATION_DATABASE_URL / TEST_* in .env at port 5432.
-- Passwords below match .env.example and are for local development only.

CREATE ROLE fielddesk_owner LOGIN SUPERUSER PASSWORD 'change-me-owner';
CREATE ROLE fielddesk_runtime NOLOGIN;
CREATE ROLE fielddesk_app LOGIN PASSWORD 'change-me-app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT fielddesk_runtime TO fielddesk_app;

CREATE DATABASE fielddesk OWNER fielddesk_owner;
CREATE DATABASE fielddesk_test OWNER fielddesk_owner;
GRANT CONNECT ON DATABASE fielddesk, fielddesk_test TO fielddesk_app;
