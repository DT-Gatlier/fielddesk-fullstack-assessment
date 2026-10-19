# FieldDesk

A multi-tenant field-service application: maintenance companies schedule work orders, assign technicians, and track progress. It was built for the Gatlier full-stack assessment. The original brief is in [docs/ASSESSMENT.md](docs/ASSESSMENT.md).

| Part | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, React Router, TanStack Query |
| API | Node.js 22, TypeScript, Fastify 5, zod |
| Worker | Node.js 22, BullMQ |
| Data | PostgreSQL 17 (row-level security, exclusion constraints), Redis 7 |
| Tests | Vitest against real PostgreSQL and Redis; Testing Library for the UI |
| Local run | Docker Compose |

Design decisions and trade-offs are explained in [candidate-submission/TECHNICAL_NOTES.md](candidate-submission/TECHNICAL_NOTES.md).

## Quick start (Docker)

Requirements: Docker Desktop with Compose v2.

```bash
cp .env.example .env            # optional; Compose has working defaults
docker compose up --build
```

| URL | What |
| --- | --- |
| http://localhost:8080 | Web app (nginx serving the SPA and proxying `/api`) |
| http://localhost:3000/health/ready | API readiness |

Compose starts Postgres and Redis, runs the one-shot `migrate` service (migrations followed by seed data), then starts `api`, `worker` and `web`. To reset everything, run `docker compose down -v`.

## Sample accounts

Every account uses the password **`FieldDesk!2026`**, which is set by `SEED_PASSWORD` and is for this assessment only.

| Organisation | Owner | Dispatcher | Technicians |
| --- | --- | --- | --- |
| Northwind Facilities | owner@northwind.test | dispatcher@northwind.test | tech1@northwind.test, tech2@northwind.test |
| Harbor Maintenance Co | owner@harbor.test | dispatcher@harbor.test | tech1@harbor.test |

Each organisation is seeded with six work orders across different statuses.

## Running without Docker

You need Node 22+, a PostgreSQL 15+ server and Redis 6.2+.

```bash
npm install
cp .env.example .env
# Create roles and databases once (as a Postgres superuser):
psql -h localhost -U postgres -f database/local-setup.sql
# Edit .env: point the four *_DATABASE_URL values at your server (default file assumes port 5433).
npm run db:migrate
npm run db:seed
npm run dev:api      # http://localhost:3000
npm run dev:worker   # separate terminal
npm run dev:web      # http://localhost:5173 (Vite proxies /api, including WebSockets)
```

## Tests, lint and build

The backend tests need PostgreSQL and Redis. They use the `fielddesk_test` database, which `global-setup` drops and rebuilds from the migrations on every run.

```bash
docker compose up -d postgres redis   # or use your own servers, configured in .env
npm test                 # backend + frontend
npm run test:backend     # integration tests against real Postgres + Redis
npm run test:frontend    # UI workflow test (jsdom)
npm run lint             # ESLint + TypeScript type-check, both workspaces
npm run build            # compiles the API/worker and builds the SPA
```

## Repository layout

```text
.
|-- backend/                 API and worker (one TypeScript codebase, two processes)
|   |-- src/
|   |   |-- server.ts        API entry point (graceful shutdown)
|   |   |-- worker.ts        Worker entry point (BullMQ consumer + recovery sweep)
|   |   |-- app.ts           Fastify app factory: plugins, hooks, routes
|   |   |-- config.ts        Environment configuration, validated with zod
|   |   |-- auth/            Password hashing, sessions, role guards, login/logout
|   |   |-- work-orders/     Model, list/filter builder, service (transactions), CSV export
|   |   |-- progress-events/ Idempotent technician event API
|   |   |-- attachments/     Upload/download, magic-byte detection, storage driver
|   |   |-- notifications/   Queue, mock provider, job processor, worker factory
|   |   |-- realtime/        WebSocket endpoint and Redis pub/sub fan-out
|   |   |-- users/, organisation/, health/, audit/, http/, db/
|   |-- test/                Integration tests (real Postgres + Redis)
|   `-- Dockerfile           One image; command selects api / worker / migrate
|-- frontend/                React SPA, nginx config, UI test
|-- database/
|   |-- migrations/          Ordered SQL migrations (applied by backend/src/db/migrate.ts)
|   |-- init/                Docker first-boot script (roles, test database)
|   `-- local-setup.sql      Same, for a non-Docker Postgres
|-- candidate-submission/    Technical notes and AI usage disclosure
|-- docker-compose.yml
`-- .env.example
```

The brief suggests a top-level `worker/` folder. The worker lives in `backend/` instead, because it shares the data-access, audit and domain code with the API. It is still a separate process and container (`docker compose` service `worker`, entry point `backend/src/worker.ts`), so it can be deployed and scaled independently. Tests live in `backend/test` and next to the frontend code (`*.test.tsx`), following each tool's convention.

## API overview

Every endpoint except login and health checks requires the `fd_session` cookie. Errors always have this shape: `{ "error": { "code", "message", "details?", "requestId" } }`.

| Method and path | Roles | Purpose |
| --- | --- | --- |
| `POST /api/auth/login` | public (rate-limited) | Start a session |
| `POST /api/auth/logout` | any | Revoke the session |
| `GET /api/auth/me` | any | Current user and organisation |
| `GET /api/users` | owner, dispatcher | List users (`?role=technician`) |
| `POST /api/users`, `PATCH /api/users/:id` | owner | Create users; change role or active status (audited) |
| `GET /api/organisation` | any | Organisation name and storage usage |
| `PATCH /api/organisation` | owner | Name and storage limit (audited) |
| `GET /api/work-orders` | any (technicians see only their own) | Search, filter, sort, paginate |
| `GET /api/work-orders/export.csv` | any (same scope as the list) | Streamed CSV export |
| `GET /api/work-orders/:id` | any (same scope) | Details, attachments, activity history |
| `POST /api/work-orders`, `PATCH /api/work-orders/:id` | owner, dispatcher | Create; edit, assign, schedule, change status |
| `GET /api/dashboard/summary` | any (same scope) | Counts for the dashboard |
| `POST /api/progress-events` | technician (rate-limited) | Idempotent progress events |
| `POST /api/work-orders/:id/attachments` | owner, dispatcher, assigned technician | Upload an image or PDF (multipart, field `file`) |
| `GET /api/attachments/:id/download` | same as upload | Download |
| `GET /api/realtime` (WebSocket) | any | Live change notifications |
| `GET, PUT /api/dev/mock-provider` | owner, dispatcher (not in production) | Switch the mock notification provider's behaviour |
| `GET /health/live`, `GET /health/ready` | public | Liveness and readiness |

## Demonstrating background-job failures

As an owner or dispatcher, open **Settings → Notification provider (demo)**, or call `PUT /api/dev/mock-provider` with `{"mode": "..."}`. The available modes are:

- `success`
- `temporary_failure`: retried with exponential backoff, then marked failed
- `permanent_failure`: not retried
- `fail_twice`: succeeds on the third attempt

Assign a technician to a work order and watch the worker logs (`docker compose logs -f worker`) and the work order's activity history.
