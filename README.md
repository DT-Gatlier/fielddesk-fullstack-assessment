# FieldDesk Full-Stack Engineering Assessment

This practical assessment is conducted by **Gatlier** to evaluate full-stack engineering ability, with particular emphasis on backend correctness, security, database design, testing and production awareness.

FieldDesk is a fictional field-service application created solely for this assessment. Candidates are expected to build a working application, explain their technical decisions and take ownership of everything they submit.

## Start here

1. Read the complete [assessment brief](docs/ASSESSMENT.md).
2. Review the [evaluation criteria](docs/EVALUATION.md).
3. Follow the [submission instructions](docs/SUBMISSION.md).
4. Complete the [technical notes](candidate-submission/TECHNICAL_NOTES.md) and [AI usage disclosure](candidate-submission/AI_USAGE.md).
5. Raise questions or blockers through a GitHub Issue in this repository.

## Overview: Full-Stack Multi-Tenant FieldDesk Implementation

FieldDesk is a multi-tenant maintenance operations platform built with Next.js 16, NestJS, PostgreSQL 17, and Redis 7.4.

Key features implemented:
- **Authentication & Tenant Isolation**: Secure session cookies, CSRF synchronizer token protection, Argon2id password hashing, and strict role-based access control (Owner, Dispatcher, Technician) with tenant-scoped database queries.
- **Work-Order Management**: Full creation, editing, scheduling, priority management, search, filtering, and pagination.
- **Scheduling & Concurrency**: PostgreSQL `btree_gist` exclusion constraints preventing overlapping technician schedules under concurrent requests.
- **Progress-Event Audit Trail**: Immutable progress events with idempotent replays and pre-authorization validation.
- **Transactional Outbox Worker**: Decoupled background notification processor with exponential backoff retries and dead-letter queue routing.
- **Real-Time Reactivity**: Server-Sent Events (SSE) backed by tenant-isolated Redis Pub/Sub channels.
- **Secure File Storage**: Magic-byte MIME sniffing, SHA-256 deduplication, and organisation storage quota enforcement.
- **Reporting**: Organisation-scoped CSV exports with formula-injection neutralization.

### Local setup

Use Node.js **22.23.1** (recorded in `.nvmrc`) and pnpm **10.34.6** (recorded in
the root `packageManager` field). Install pnpm with:

```sh
npm install --global pnpm@10.34.6
pnpm install --frozen-lockfile
pnpm prepare:api
```

`pnpm prepare:api` generates and builds the shared database types without connecting
to PostgreSQL. Run it before opening API files so editor tooling can resolve those
types.

The frontend runs at <http://localhost:3000> and the API at
<http://localhost:3001>. The API starter responds to `GET /` with `Hello World!`.
Set up Docker, the API and frontend environments, migrations and seeds below before running
`pnpm dev`. The API connects to PostgreSQL and Redis before serving requests.
The API reads `PORT` from the process environment, defaulting to `3001`.
For example, in PowerShell: `$env:PORT = '3002'; pnpm dev:api`.

| Command                              | Purpose                                          |
| ------------------------------------ | ------------------------------------------------ |
| `pnpm dev`                           | Start both apps in watch mode                    |
| `pnpm dev:web` / `pnpm dev:api`      | Start a single app                               |
| `pnpm build`                         | Build all apps                                   |
| `pnpm start`                         | Start both apps after building                   |
| `pnpm --filter @fielddesk/web start` | Start the built frontend alone                   |
| `pnpm --filter @fielddesk/api start` | Start the built API alone                        |
| `pnpm lint` / `pnpm lint:fix`        | Check lint rules / apply fixes                   |
| `pnpm typecheck`                     | Generate Next.js route types and check app types |
| `pnpm format:check` / `pnpm format`  | Check formatting / apply formatting              |
| `pnpm test`                          | Run API, database safety and frontend unit tests |
| `pnpm codegen`                       | Generate frontend types from a running API      |
| `pnpm test:e2e`                      | Build and run isolated frontend browser tests   |

### Frontend configuration

On first setup, copy `apps/web/.env.example` to `apps/web/.env.local`. Keep an
existing file. Set `NEXT_PUBLIC_API_URL` to the API origin, normally
`http://localhost:3001`. It is a public setting; never place credentials in it.
Restart development or rebuild production after changing it. Use `localhost`
consistently rather than mixing it with `127.0.0.1`, and allow the frontend origin
in the API's `ALLOWED_ORIGINS`.

Visit `/login` and use a seeded account (or click "Demo accounts" to auto-fill).
`/dashboard` displays live work-order metrics, status breakdowns, and active work orders.
The theme selector supports Light, Dark and System and remembers your preference.

Run `pnpm codegen` after backend contract changes, with the API running at the
configured origin. Commit the generated types; builds do not require a running API.
See [frontend setup and browser testing](apps/web/README.md) and the
[frontend architecture decision](docs/decisions/004-frontend-authentication.md).

### PostgreSQL and Redis in Docker

Run Docker Desktop with Linux containers. From the repository root, in PowerShell:

```powershell
Copy-Item .env.example .env
docker compose config --quiet
docker compose up -d --wait --wait-timeout 120
docker compose ps
```

Copy the example only on first setup; keep your existing `.env` on later runs.
The root `.env` is ignored by Git. Compose reads it to substitute variables in
`docker-compose.yml`; the PostgreSQL service explicitly receives its user,
password, and database variables. Host-port settings are not container environment
settings. Neither workspace app loads this root file automatically.

The images are pinned to PostgreSQL 17.11 and Redis 7.4.11. PostgreSQL stores its
data in the `postgres_data` named volume; Redis stores AOF data in `redis_data`.
Redis uses an every-second AOF flush and `noeviction`, suitable for future queues.
Services restart unless explicitly stopped. Both host ports bind to loopback only;
Redis has no password in this local setup.

| Service    | Windows application address | Future container address |
| ---------- | --------------------------- | ------------------------ |
| PostgreSQL | `localhost:5432`            | `postgres:5432`          |
| Redis      | `localhost:6379`            | `redis:6379`             |

Change `POSTGRES_PORT` or `REDIS_PORT` in `.env` if a host port is already in use.
Container ports remain unchanged. With the sample values, future host-side URLs
are `postgresql://fielddesk:fielddesk_local_password@localhost:5432/fielddesk`
and `redis://localhost:6379`. Credentials and server connection URLs must stay
out of browser-facing `NEXT_PUBLIC_*` settings.

Check connections from inside the containers:

```sh
docker compose exec -T postgres psql -U fielddesk -d fielddesk -c "SELECT 1;"
docker compose exec -T redis redis-cli ping
```

Use your configured user/database in the PostgreSQL command if you changed the
example values. Expect a successful query and Redis `PONG`.

Useful commands:

```sh
docker compose logs --tail 50 postgres redis
docker compose stop
docker compose up -d --wait --wait-timeout 120
docker compose down
```

Ordinary `down` removes containers and the network but retains named volumes.
Do not add `--volumes` unless you deliberately want to delete all local data.
PostgreSQL user/password/database environment settings initialise an empty volume;
changing `.env` later does not change credentials in an existing database.

For a persistence check, save a disposable row/key, run ordinary `down` then `up`,
and read both values back. Remove the disposable row/key afterward. This checks
container recreation without deleting volumes.

### API configuration

From the repository root, create the API's local configuration on first setup:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

Keep an existing API `.env` rather than overwriting it. Adjust `DATABASE_URL` to
match the root Compose user/password/database and host port; percent-encode any
special characters in URL credentials. Adjust `REDIS_URL` if you changed Redis's
host port. The API `.env` is ignored by Git. Updating Compose `.env` does not update
the API file or change an existing PostgreSQL database's password.

NestJS loads only `apps/api/.env`, using a path relative to its application module
for both development and compiled startup. Exported process variables take
precedence. Root `.env` is exclusively for Compose. Builds need no credentials;
runtime URLs and credentials are never passed to the frontend or placed in
`NEXT_PUBLIC_*` variables.

| API setting           | Validation                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `PORT`                | Integer from 1 to 65535; defaults to 3001 when absent                                     |
| `DATABASE_URL`        | Required URL with a host and `postgresql:` or `postgres:` protocol                        |
| `REDIS_URL`           | Required URL with a host and `redis:` or `rediss:` protocol                               |
| `ALLOWED_ORIGINS`     | Exact comma-separated HTTP(S) origins; default `http://localhost:3000`                    |
| `SESSION_TTL_SECONDS` | Integer 60â€“604800; default 28800 (absolute eight hours)                                 |
| `COOKIE_SECURE`       | `true`/`false`; defaults to true in production, false otherwise; production rejects false |
| `REDIS_KEY_PREFIX`    | Safe security-key namespace; default `fielddesk`                                          |

Invalid configuration stops API startup with setting names and safe descriptions,
without logging supplied values. The database provider additionally checks
PostgreSQL connectivity before the API starts listening. It uses at most five
connections, a five-second connection timeout and a ten-second statement timeout.
Shutdown hooks release its pool.

To override the API port from PowerShell:

```powershell
$env:PORT = '3002'
pnpm dev:api
# After stopping the app:
Remove-Item Env:PORT
```

Turbo passes `PORT`, `DATABASE_URL`, `REDIS_URL`, and `NODE_ENV` only to the API's
runtime tasks. Unit and HTTP smoke tests supply explicit fixtures before app
imports and replace the database provider; `pnpm test` needs no running database.
The separate integration checks use a real dedicated PostgreSQL database and
Redis. Additional security settings above are passed only to API runtime tasks.
See [authentication setup and lifecycle](docs/decisions/003-backend-authentication.md)
for endpoints, browser flow, permissions, limits and production assumptions.

### Database setup and commands

`packages/database` owns the schema, generated client and the single migration
directory at `packages/database/prisma/migrations`. Prisma, its generated client
and PostgreSQL adapter are pinned to 7.10.0. The generated client uses CommonJS
to match NestJS; generated sources and build output are ignored by Git.
Generation and builds work without database credentials.

Database CLI commands explicitly read `apps/api/.env`; exported variables take
precedence. They never load the root Compose `.env`. After configuring that file:

```sh
docker compose up -d --wait
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

| Command                                       | Purpose                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm db:generate`                            | Generate the shared client without connecting                             |
| `pnpm db:migrate:deploy`                      | Apply committed migrations; use for CI and reproducible setup             |
| `pnpm db:migrate:dev --name descriptive_name` | Create a migration during local schema development                        |
| `pnpm db:seed`                                | Add missing sample organisations/users without replacing existing records |
| `pnpm db:studio`                              | Open Prisma Studio                                                        |
| `pnpm db:test:setup`                          | Create the dedicated test database if absent and apply migrations         |
| `pnpm db:test:reset`                          | Delete all data in the dedicated test database and reapply migrations     |
| `pnpm test:integration`                       | Run database constraints, seeds and NestJS lifecycle checks               |

`migrate dev` needs a shadow database. The local Compose PostgreSQL user is a
superuser and can create it; this is a local development convenience. Use a
restricted deployment role and `migrate deploy` outside development.

Fresh seeds create Clearbrook Maintenance and Oakridge Property Services, each
with one owner, one dispatcher and three technicians (ten users total).
All accounts below are fictional assessment fixtures. Their shared demo password
is `Demo2026`, stored as Argon2id hashes; no email delivery is configured.

| Organisation | Name | Role | Email |
|---|---|---|---|
| Clearbrook Maintenance | Arjun Nair | OWNER | `arjun.nair@clearbrook.org` |
| Clearbrook Maintenance | Meera Menon | DISPATCHER | `meera.menon@clearbrook.org` |
| Clearbrook Maintenance | Rahul Sharma | TECHNICIAN | `rahul.sharma@clearbrook.org` |
| Clearbrook Maintenance | Priya Patel | TECHNICIAN | `priya.patel@clearbrook.org` |
| Clearbrook Maintenance | Kiran Rao | TECHNICIAN | `kiran.rao@clearbrook.org` |
| Oakridge Property Services | Ananya Iyer | OWNER | `ananya.iyer@oakridge.org` |
| Oakridge Property Services | Vikram Singh | DISPATCHER | `vikram.singh@oakridge.org` |
| Oakridge Property Services | Neha Gupta | TECHNICIAN | `neha.gupta@oakridge.org` |
| Oakridge Property Services | Rohan Das | TECHNICIAN | `rohan.das@oakridge.org` |
| Oakridge Property Services | Aditi Joshi | TECHNICIAN | `aditi.joshi@oakridge.org` |

Seed fixtures are private scripts, absent from the package's public exports.
Seeding again preserves edited names, roles, passwords and additional records.
Existing North/South demo accounts are retained; this seed adds the new fixtures
without deleting or renaming existing data.
Seeds are disabled when `NODE_ENV=production`.

Emails must be nonempty, trimmed and lowercase; call the package's
`normalizeEmail` helper at future application boundaries. Global email uniqueness
is the current assumption. The database enforces normalization, organisation
references and a unique `(organisationId, id)` user key for future tenant-aware
foreign keys. Scheduling constraints belong to later feature migrations.

### Real-database tests

On first setup, copy the test example and adjust its credentials and host port to
match the API's development database server:

```powershell
Copy-Item packages/database/.env.test.example packages/database/.env.test
pnpm db:test:setup
pnpm test:integration
```

The ignored `packages/database/.env.test` contains explicit `TEST_DATABASE_URL`
and optional `TEST_REDIS_URL` (defaults to `redis://localhost:6379/15`).
Test commands first load API configuration, then this test file, respecting
process overrides. They compare parsed host, port and database names: the target
must be `fielddesk_test` on the development server, distinct from the development
database. Production mode and unexpected targets are rejected before mutation.
Integration tests require an empty test database and intentionally leave their
fixtures behind. Before a repeat run, deliberately reset only this test database:

```sh
pnpm db:test:reset
pnpm test:integration
```

The reset irreversibly deletes test data. Prisma may require explicit human
consent when an AI agent invokes it; scripts do not bypass that safeguard.
CI provisions a fresh PostgreSQL service and test database, then uses
`migrate deploy` rather than a destructive reset.
Authentication tests create and clean up their own two-organisation/six-user
fixtures and use a unique Redis namespace. They never flush Redis or delete
unrelated database records. The database suite restores edited sample passwords
and roles after checking seed preservation. API-only integration checks can be
repeated without resetting: `pnpm --filter @fielddesk/api test:integration`.

### Workspace standards

```text
apps/api/                    NestJS HTTP application
apps/web/                    Next.js App Router application
packages/typescript-config/  Shared strict compiler presets
packages/eslint-config/      Shared lint rules and framework presets
packages/database/           Prisma schema, migrations and shared client
```

Apps own their runtime dependencies and do not import one another. Shared
configuration is consumed through `workspace:*` dependencies. Keep a single
root lockfile and package-manager declaration; run installations from the root.

Turborepo coordinates commands and caches build output. Development and production
servers are persistent and uncached. Build hashes include app environment files
and `NEXT_PUBLIC_*` variables. `PORT` is passed through to API runtime tasks.
Add future environment variables explicitly to the applicable Turbo task.

TypeScript is strict, with separate frontend and backend compiler presets.
ESLint checks are read-only; formatting uses root Prettier settings and LF line
endings. Generated files and build artifacts are excluded. GitHub CI runs frozen
installation, formatting, lint, type checks, isolated tests, PostgreSQL integration
checks and builds on pull
requests and pushes to `main` and `assessment/arshadakl`.

See [the setup decision](docs/decisions/001-monorepo-foundation.md) for boundaries
and deferred work.

## Required assessment stack

- React or Next.js with TypeScript
- Node.js with TypeScript
- PostgreSQL
- Redis with a suitable job queue
- Docker Compose

Libraries and architectural patterns are the candidate's choice. Significant decisions and trade-offs should be documented.

## What to submit

- A working frontend, API and background worker
- Database migrations and seed data
- Automated tests
- Docker-based local setup
- Clear technical documentation
- Completed submission templates
- A pull request from the candidate's fork
- A 10â€“15 minute screen recording
- The final commit SHA

AI-assisted development tools are permitted. Every use must be disclosed clearly, including the tools used, the files or sections affected, the purpose of the assistance and how the output was verified. The candidate remains responsible for the correctness, security and maintainability of all submitted work.

There is no prescribed visual design. A clear, usable interface is sufficient; engineering quality is the main consideration.

## Communication

Use GitHub Issues for all assessment questions, assumptions and technical blockers. This keeps clarifications visible and ensures every candidate receives consistent information.

Please do not include confidential information, credentials or code from a current or previous employer.

---

**Conducted by Gatlier**
