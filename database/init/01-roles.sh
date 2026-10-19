#!/bin/sh
# Runs once, when the Postgres data volume is first initialised.
# Creates the unprivileged runtime role used by the API/worker and the test database.
# Tables are owned by POSTGRES_USER (used only for migrations and seeding); the runtime
# role is not the owner, so row-level security policies apply to it.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" -v main_db="$POSTGRES_DB" <<'EOSQL'
CREATE ROLE fielddesk_runtime NOLOGIN;
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT fielddesk_runtime TO :"app_user";
GRANT CONNECT ON DATABASE :"main_db" TO :"app_user";

CREATE DATABASE fielddesk_test;
GRANT CONNECT ON DATABASE fielddesk_test TO :"app_user";
EOSQL
