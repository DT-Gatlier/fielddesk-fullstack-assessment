# FieldDesk

A multi-tenant field-service application: maintenance companies schedule work orders, assign technicians, track progress and attachments, and see changes live. Each organisation's data is isolated from every other organisation's.

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, TanStack Query, React Router, Tailwind CSS |
| API | Node.js 22 + TypeScript, Express 5, Zod, pino |
| Database | PostgreSQL 16 (plain SQL migrations, `pg`) |
| Queue / pub-sub / rate limits | Redis 7 + BullMQ |
| Local runtime | Docker Compose |

Design decisions, trade-offs and known limitations are in [`candidate-submission/TECHNICAL_NOTES.md`](candidate-submission/TECHNICAL_NOTES.md).

---

## Quick start (Docker)

Requires Docker with Compose v2.

```bash
docker compose up --build
```

| URL | What |
|---|---|
| http://localhost:8080 | Web app |
| http://localhost:4000/healthz | API liveness |
| http://localhost:4000/readyz | API readiness (database, migrations, Redis) |

The `migrate` service applies migrations and seeds demo data on first start. To start over with a clean database:

```bash
docker compose down -v && docker compose up --build
```

### Demo accounts

Every account uses the password **`Password123!`** (demo only; set `SEED_PASSWORD` to change it).

| Organisation | Role | Email |
|---|---|---|
| Acme Facilities | Owner | `owner@acme.test` |
| Acme Facilities | Dispatcher | `dispatcher@acme.test` |
| Acme Facilities | Technician | `tech1@acme.test`, `tech2@acme.test` |
| Acme Facilities | Technician (mock inbox fails twice, then succeeds) | `fred+tempfail@acme.test` |
| Acme Facilities | Technician (mock inbox rejects permanently) | `ivan+permfail@acme.test` |
| Brightline Maintenance | Owner | `owner@brightline.test` |
| Brightline Maintenance | Dispatcher | `dispatcher@brightline.test` |
| Brightline Maintenance | Technician | `tech1@brightline.test`, `tech2@brightline.test` |

---

## Local development (without containers for the app)

```bash
docker compose up -d postgres redis   # infrastructure only
npm install
cp .env.example .env                  # local placeholders, no real secrets
npm run db:migrate
npm run db:seed

npm run dev:api      # http://localhost:4000
npm run dev:worker   # separate process
npm run dev:web      # http://localhost:5173 (proxies /api to the API)
```

## Commands

| Command | What it does |
|---|---|
| `npm test` | All automated tests: API/worker integration tests, the full-stack frontend workflow test, and frontend unit tests |
| `npm run test:api` | Integration tests only |
| `npm run lint` | ESLint over the whole repository |
| `npm run typecheck` | TypeScript in strict mode for backend, worker, frontend and tests |
| `npm run build` | Production builds of API, worker and frontend |
| `npm run db:migrate` / `db:seed` / `db:reset` | Apply migrations, seed demo data, or wipe and reseed (development only) |
| `npm run mock-provider -- <cmd>` | Control the mock notification provider (see below) |

**Tests need PostgreSQL and Redis running.** They use a separate `fielddesk_test` database (created by `database/init/`) and Redis logical DB 15, and they reset that data themselves:

```bash
docker compose up -d postgres redis
npm test
```

Override the connections with `TEST_DATABASE_URL` and `TEST_REDIS_URL`. Compose publishes PostgreSQL on host port **55432** (not 5432) so a locally installed PostgreSQL cannot intercept the connection; change it with `POSTGRES_HOST_PORT` in `.env` (and export the same variable when running `npm test`). If you see `password authentication failed for user "fielddesk"`, something else is answering on that port. If your Postgres volume was created before `database/init/` existed, create the test database once: `docker compose exec postgres createdb -U fielddesk fielddesk_test`.

---

## Trying the interesting parts

**Organisation isolation.** Sign in as `dispatcher@acme.test`, open a Brightline work order URL (copy an ID from a Brightline session) or call the API with a Brightline ID. You get `404 Not Found`, not the other organisation's data.

**Scheduling conflicts.** Open two browser profiles as `dispatcher@acme.test` and `owner@acme.test`. Assign the same technician to overlapping windows on two work orders. The second save shows a conflict naming the work order that already holds the slot. The automated proof is `tests/scheduling-concurrency.test.ts`, which fires the conflicting requests simultaneously through two separate API instances.

**Live updates.** Keep the dashboard open in one window and change a work order in another. The dashboard counts, the list and the "Live activity" feed update without a refresh. The header shows "Live", "Reconnecting…" or "Live updates paused".

**Background notifications.** Assigning a technician queues a notification, which the worker delivers through the mock provider. The work-order page shows the delivery status to dispatchers.
- Assign **Fred Flaky-Inbox**: two temporary failures, retried with backoff, then delivered ("Delivered after 3 attempts").
- Assign **Ivan Invalid-Inbox**: a permanent failure, so no retries ("Failed").

You can switch the provider for everyone at runtime:

```bash
# Docker
docker compose exec worker node dist/mock-provider-cli.js mode temporary_failure
docker compose exec worker node dist/mock-provider-cli.js status
docker compose exec worker node dist/mock-provider-cli.js sent     # messages actually delivered
docker compose exec worker node dist/mock-provider-cli.js reset
# Local
npm run mock-provider -- mode flaky      # success | temporary_failure | permanent_failure | flaky
```

**Progress events (technician API).**

```bash
curl -c jar -H 'content-type: application/json' \
  -d '{"email":"tech1@acme.test","password":"Password123!"}' http://localhost:4000/api/auth/login
curl -b jar http://localhost:4000/api/work-orders            # copy an id
curl -b jar -H 'content-type: application/json' http://localhost:4000/api/progress-events -d '{
  "eventId": "evt-10001", "workOrderId": "<id>", "type": "status_changed",
  "occurredAt": "2026-08-04T10:30:00Z", "payload": { "status": "in_progress", "note": "Work started" } }'
```

Sending the same request again returns `200` with `"duplicate": true` and the original result. Reusing the `eventId` with different content returns `409 EVENT_ID_REUSED`.

**CSV export.** "Export CSV" on the work-order list downloads exactly the filtered rows, scoped to your organisation.

---

## API overview

All endpoints are under `/api`, return JSON as `{ "data": ... }`, and return errors as `{ "error": { "code", "message", "details"?, "requestId" } }`. Every response carries an `X-Request-Id` header.

| Method and path | Roles |
|---|---|
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | anyone (rate-limited login) |
| `GET /work-orders` (search, filter, sort, paginate), `GET /work-orders/summary` | all (technicians see only their assignments) |
| `GET /work-orders/export.csv` | owner, dispatcher |
| `POST /work-orders`, `PATCH /work-orders/:id`, `PUT /work-orders/:id/assignment`, `POST /work-orders/:id/status` | owner, dispatcher |
| `GET /work-orders/:id`, `GET /work-orders/:id/activity` | all (technicians: assigned only) |
| `POST /work-orders/:id/attachments`, `GET /attachments/:id/download` | all (technicians: assigned only) |
| `POST /progress-events` | technician (rate-limited) |
| `GET /realtime/stream` (Server-Sent Events) | all |
| `GET /users` | owner, dispatcher |
| `POST /users`, `PATCH /users/:id` | owner |
| `GET /organisation`, `PATCH /organisation`, `GET /organisation/audit-log` | read: all; write and audit log: owner |

---

## Repository structure

```
.
├── backend/                 Express API
│   └── src/
│       ├── app.ts           app factory (used by server.ts and tests)
│       ├── server.ts        process entry: listen + graceful shutdown
│       ├── db/              migration runner, seed data
│       ├── lib/             errors, permissions, sessions, test failpoints
│       ├── middleware/      auth, validation, errors, request context, rate limits
│       └── modules/         auth, users, organisation, work-orders, events,
│                            attachments, reports (CSV), notifications (outbox), realtime (SSE)
├── worker/                  Background worker (separate process)
│   └── src/                 runtime (BullMQ), outbox relay, notify, backoff, mock provider + CLI
├── shared/                  Code used by both API and worker: config, db, logger, redis, audit, realtime
├── frontend/                React app (+ nginx.conf for the container)
├── database/
│   ├── migrations/          PostgreSQL schema (plain SQL, applied in order)
│   └── init/                container-init script creating the test database
├── tests/                   Integration tests (real PostgreSQL + Redis) and the full-stack frontend workflow test
├── candidate-submission/    AI_USAGE.md, TECHNICAL_NOTES.md
├── docker-compose.yml
└── .env.example
```
