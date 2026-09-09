# Architecture decisions — FieldDesk

This document records the upfront architecture choices for the FieldDesk assessment implementation. It is a living reference during development; update it if a decision changes materially.

**Candidate:** suhailkc  
**Branch:** `assessment/suhailkc`  
**Last updated:** 2026-09-08

---

## 1. Summary

FieldDesk is implemented as a **three-process monorepo**: a Next.js frontend, a Fastify HTTP/WebSocket API, and a BullMQ worker. PostgreSQL is the source of truth for all tenant data, concurrency constraints, and audit records. Redis backs the job queue only.

The design prioritises **backend-enforced multi-tenant isolation**, **database-level scheduling safety**, and **testable behaviour under concurrency** — the highest-weighted evaluation areas.

---

## 2. System context

```text
┌─────────────────┐   HTTPS + cookies    ┌─────────────────┐
│  Next.js        │ ◄──────────────────► │  Fastify API    │
│  (frontend/)    │   WebSocket (WS)     │  (backend/)     │
└─────────────────┘                      └────────┬────────┘
                                                    │
                     ┌──────────────────────────────┼──────────────────────────────┐
                     ▼                              ▼                              ▼
               PostgreSQL                         Redis                      Local filesystem
            (migrations, OLTP)              (BullMQ queue)              (attachments/)
                     ▲
                     │ read/write
              ┌──────┴──────┐
              │   Worker    │
              │  (worker/)  │
              └─────────────┘
```

| Process | Responsibility | Must not do |
| --- | --- | --- |
| Frontend | UI, form validation for UX, optimistic loading states | Enforce security or tenant boundaries |
| API | Auth, authorisation, validation, transactions, enqueue jobs, serve files | Run long-running notification retries |
| Worker | Process notification jobs, retries, record outcomes | Accept HTTP from clients |

---

## 3. Technology choices

| Area | Choice | Alternatives considered | Rationale |
| --- | --- | --- | --- |
| Frontend | **Next.js 14+ (App Router) + TypeScript** | Vite + React SPA | File-based routing suits login/dashboard/CRUD flows; good TypeScript DX; no SSR requirement but structure is clear |
| Backend | **Fastify + TypeScript** | Express, NestJS | Lightweight, fast, strong plugin ecosystem (`@fastify/cookie`, `@fastify/websocket`, `@fastify/rate-limit`); less boilerplate than Nest for an assessment |
| Database | **PostgreSQL 16** | — | Required by brief; used for constraints, locking, and integration tests |
| ORM / migrations | **Drizzle ORM + SQL migrations** | Prisma, Kysely | Type-safe schema; easy to drop to raw SQL for exclusion constraints and `FOR UPDATE` queries |
| Auth | **JWT in httpOnly, Secure, SameSite=Lax cookie** | localStorage JWT, session table | Cookie reduces XSS token theft; stateless tokens scale across multiple API instances; session revocation is a known trade-off (acceptable for assessment) |
| Password hashing | **argon2** | bcrypt | Modern default; configurable cost |
| Input validation | **Zod** (API); mirrored types on frontend | class-validator | Centralised, composable schemas; consistent error mapping |
| Job queue | **BullMQ on Redis 7** | pg-boss | Built-in retries, backoff, job IDs for deduplication, good observability |
| Real-time | **WebSockets via `@fastify/websocket`** | SSE | Bidirectional; easy org-room model; client reconnect with snapshot refetch |
| File storage | **Local disk** under `data/attachments/` | — | Required for assessment; production path documented below |
| Logging | **pino** (JSON structured) | winston | Fast, structured, works well with Fastify |
| Testing | **Vitest** (unit/integration), **supertest** (HTTP), **Playwright** (one frontend workflow) | Jest | Fast; native ESM/TS support |
| Containerisation | **Docker Compose** | — | Required; runs Postgres, Redis, api, worker, frontend |

### Stack confirmation (Phase 0 — locked)

**Confirmed by suhailkc on 2026-09-08.** These choices are locked for implementation unless a blocker is discovered (document any change in §23 Decision log).

| Layer | Confirmed choice |
| --- | --- |
| Frontend | Next.js 14+ (App Router) + TypeScript |
| Backend | Fastify + TypeScript |
| Database | PostgreSQL 16 |
| ORM / migrations | Drizzle ORM + SQL migrations |
| Auth | JWT in httpOnly cookie |
| Passwords | argon2 |
| Validation | Zod |
| Queue | BullMQ on Redis 7 |
| Real-time | WebSockets (`@fastify/websocket`) |
| Files | Local disk (`data/attachments/`) |
| Logging | pino |
| Testing | Vitest + supertest + Playwright (one e2e) |
| Containers | Docker Compose |

**Full ERD and column definitions:** [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)

---

## 4. Repository layout

```text
.
├── frontend/                   # Next.js application
├── backend/                    # Fastify API (shared lib code exported for worker)
│   └── src/
│       ├── routes/
│       ├── services/
│       ├── middleware/
│       ├── db/
│       └── worker-entry.ts     # optional re-export
├── worker/                     # BullMQ consumer (imports backend services)
├── database/
│   └── migrations/             # Drizzle/SQL migration files
├── tests/
│   └── integration/            # API tests against real Postgres
├── docs/
│   └── ARCHITECTURE_DECISIONS.md
├── candidate-submission/
├── docker-compose.yml
├── .env.example
└── README.md
```

**Decision:** `worker/` is a separate package/process but **reuses** backend domain services (assignment notifications, DB access) to avoid duplicating business logic.

---

## 5. Domain model

> **Detailed ERD, columns, indexes, and migration order:** [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)

### 5.1 Core entities

| Table | Purpose |
| --- | --- |
| `organisations` | Tenant root; stores name, storage quota |
| `users` | Belongs to one organisation; has role and credentials |
| `work_orders` | Core entity; scoped by `organisation_id` |
| `work_order_attachments` | Metadata + storage key; contributes to org storage usage |
| `progress_events` | Immutable record of each accepted technician event (idempotency key) |
| `audit_logs` | Append-only business audit trail (not editable via API) |
| `notification_deliveries` | Persisted outcome of each notification attempt |

### 5.2 Enumerations

```text
UserRole:           owner | dispatcher | technician

WorkOrderStatus:    draft | scheduled | in_progress | completed | cancelled

WorkOrderPriority:  low | medium | high | urgent

ProgressEventType:  status_changed | note_added | ... (extensible, validated)

NotificationStatus: pending | sent | failed_transient | failed_permanent
```

### 5.3 Key relationships

- Every tenant-owned row includes `organisation_id NOT NULL`.
- `work_orders.assigned_technician_id` → `users.id` (same organisation enforced by application + FK composite or trigger).
- `progress_events.work_order_id` → `work_orders.id`.
- `audit_logs` references polymorphic target (`entity_type`, `entity_id`).

### 5.4 Indexes (initial)

- `users(organisation_id, email)` UNIQUE
- `work_orders(organisation_id, status, scheduled_start)`
- `work_orders(organisation_id, reference_number)` UNIQUE
- `work_orders(assigned_technician_id, scheduled_start, scheduled_end)` WHERE status NOT IN ('cancelled')
- `progress_events(event_id)` UNIQUE
- `audit_logs(organisation_id, created_at DESC)`

---

## 6. Authentication and authorisation

### 6.1 Login flow

1. `POST /api/v1/auth/login` with email + password.
2. API validates credentials; verifies user is active.
3. API issues signed JWT containing `{ sub: userId, org: organisationId, role }`.
4. JWT set as **httpOnly cookie** (`access_token`); optional short-lived refresh cookie if implemented.
5. Subsequent requests send cookie automatically (`credentials: 'include'` on frontend).

### 6.2 Authorisation model

**Rule:** Organisation ID and role are derived **only** from the verified JWT/session — never from request body, query string, or URL path alone.

| Layer | Enforcement |
| --- | --- |
| Middleware | Verify JWT; attach `AuthContext { userId, organisationId, role }` to request |
| Route guards | `requireRole('dispatcher')`, `requireAnyRole(['owner','dispatcher'])` |
| Service layer | All queries include `WHERE organisation_id = ctx.organisationId` |
| Resource checks | Technician may only act on work orders assigned to them |

### 6.3 Role permissions

| Action | Owner | Dispatcher | Technician |
| --- | :---: | :---: | :---: |
| Manage users / org settings | ✅ | ❌ | ❌ |
| Create / edit work orders | ✅ | ✅ | ❌ |
| Assign technician / schedule | ✅ | ✅ | ❌ |
| List all org work orders | ✅ | ✅ | assigned only |
| View work order detail | ✅ | ✅ | if assigned |
| Submit progress events | ❌ | ❌ | ✅ (assigned only) |
| Upload attachments | ✅ | ✅ | ❌ |
| Download attachments | ✅ | ✅ | if can view work order |
| CSV export | ✅ | ✅ | ❌ |
| View audit history | ✅ | ✅ | read-only on accessible orders |

Frontend hides unauthorised actions for UX; **API always re-checks**.

### 6.4 Cross-organisation protection

Attempts to access another org's resources by tampering with IDs return **404** (not 403) where appropriate to avoid leaking existence.

Automated tests cover: list, get-by-id, update, assign, attachment download, CSV export, and WebSocket subscription across org boundaries.

---

## 7. Multi-tenant isolation

### 7.1 Strategy

**Shared database, shared schema, row-level tenant key (`organisation_id`).**

Not using separate schemas or databases per tenant — acceptable for assessment scale; documented as a scaling trade-off.

### 7.2 Enforcement points

1. **Repository/query helpers** — `withOrgScope(orgId)` appended to every SELECT/UPDATE/DELETE.
2. **Foreign key validation** — assigning a technician verifies `users.organisation_id = work_orders.organisation_id`.
3. **Real-time rooms** — clients join `org:{organisationId}` only after JWT validation; events published to org room only.
4. **File serving** — attachments served through authenticated API; storage path never exposed; download checks org + role.

### 7.3 What we do not trust

- `organisationId` in JSON body
- Role hints from frontend
- Original filename or client-supplied storage path
- Client-generated `eventId` format beyond uniqueness (still validated)

---

## 8. Work orders and scheduling

### 8.1 Scheduling rules

- A technician may not have overlapping assignments for non-cancelled work orders.
- `scheduled_start` must be before `scheduled_end`.
- Assignment and schedule updates run in a **single transaction**.

### 8.2 Concurrency approach

**Primary:** PostgreSQL transaction with conflict detection.  
**Backstop:** Database exclusion constraint.

```sql
-- Requires btree_gist extension
ALTER TABLE work_orders
  ADD CONSTRAINT work_orders_no_overlap
  EXCLUDE USING gist (
    assigned_technician_id WITH =,
    tstzrange(scheduled_start, scheduled_end, '[)') WITH &&
  )
  WHERE (assigned_technician_id IS NOT NULL AND status NOT IN ('cancelled'));
```

**Transaction flow (assign/update schedule):**

1. `BEGIN`
2. `SELECT ... FROM work_orders WHERE assigned_technician_id = $tech AND overlaps(...) FOR UPDATE`
3. If overlap found → `ROLLBACK`, return `409 SCHEDULING_CONFLICT`
4. Update `work_orders` row
5. Insert `audit_logs` entry
6. `COMMIT`
7. Enqueue notification job (after commit)
8. Publish WebSocket event (after commit)

### 8.3 Multi-instance safety

> **Full write-up:** [SCHEDULING_CONCURRENCY.md](./SCHEDULING_CONCURRENCY.md)

Locks and exclusion constraints live in **PostgreSQL**, not in application memory. API processes are stateless; scheduling coordination is never held in Redis or an in-process mutex.

When two API instances race on the same assignment window:

1. Each runs `assignWorkOrderSafely()` in its own DB transaction.
2. Row-level locks (`FOR UPDATE`) and the overlap query resolve most conflicts in application code with `409 SCHEDULING_CONFLICT`.
3. If both transactions pass the query before either commits, the **`work_orders_no_overlap` exclusion constraint** rejects one commit with `SQLSTATE 23P01`, which is also mapped to `409`.
4. Exactly one assignment persists — covered by `backend/tests/scheduling.test.ts`.

**Scaling implication:** horizontal API scaling is safe for scheduling as long as all instances use the same PostgreSQL database. No sticky sessions or distributed locks are required for this invariant.

### 8.4 Automated concurrency test

Integration test fires two parallel assign requests for the same technician and overlapping window; asserts exactly one succeeds and one receives `409`.

---

## 9. Progress events (idempotency)

### 9.1 Endpoint

`POST /api/v1/progress-events`

### 9.2 Processing flow

1. Validate schema (Zod): `eventId`, `workOrderId`, `type`, `occurredAt`, `payload`.
2. Authenticate; require `technician` role.
3. `BEGIN TRANSACTION`
4. Load work order `FOR UPDATE` where `id = workOrderId AND organisation_id = ctx.org AND assigned_technician_id = ctx.userId`.
5. If not found → `ROLLBACK`, return `404`.
6. `INSERT INTO progress_events (...)` with unique `event_id`.
   - On unique violation → `ROLLBACK` to savepoint or query existing row; return **same success response** (idempotent).
7. Apply side effects (e.g. update work order status from payload).
8. Insert immutable `progress_events` row and `audit_logs` entry.
9. `COMMIT`
10. Publish real-time update.

### 9.3 Idempotency mechanism

- **Unique index** on `progress_events(event_id)` globally.
- Duplicate concurrent submissions: one insert wins; others catch unique violation and return the stored result without re-applying side effects.

### 9.4 Rate limiting

`POST /progress-events` rate-limited per user (e.g. 60/min) via `@fastify/rate-limit`.

---

## 10. Attachments and storage quotas

### 10.1 Upload flow

1. Authorised user uploads via `multipart/form-data` to work order endpoint.
2. Backend validates MIME type (magic bytes + allowlist: `image/jpeg`, `image/png`, `application/pdf`).
3. Enforce max file size (configurable, default **10 MB**).
4. Check org quota: `current_usage + file_size <= organisations.storage_limit_bytes`.
5. Generate storage key: `{organisationId}/{uuid}.{ext}` — never use original filename on disk.
6. Write file to `ATTACHMENTS_DIR`; insert metadata row; increment org usage counter in same transaction.

### 10.2 Download / access

- `GET /api/v1/attachments/:id/download` — streams file after org + role check.
- No static `/uploads/...` public URLs.

### 10.3 Production storage path

Replace local `fs` adapter with S3-compatible object storage:

- Upload via pre-signed PUT URL or server-side PutObject.
- Store object key in DB; serve via pre-signed GET or authenticated proxy.
- Org quota unchanged; computed from DB metadata or S3 inventory sync.

---

## 11. Background jobs (notifications)

### 11.1 Trigger

When a work order assignment changes (create or reassignment), API enqueues:

```text
Queue:   notifications
Job:     notify-technician
Job ID:  notify:{workOrderId}:{assignmentVersion}
Payload: { workOrderId, technicianId, organisationId, correlationId }
```

Deterministic `jobId` prevents duplicate queued jobs for the same assignment version.

### 11.2 Worker behaviour

| Scenario | Behaviour |
| --- | --- |
| Mock provider success | Mark delivery `sent`; audit log; WS event |
| Transient failure (5xx, timeout) | BullMQ retry with exponential backoff (e.g. 3 attempts: 5s, 25s, 125s) |
| Permanent failure (invalid payload, unknown user) | Mark `failed_permanent`; no further retries |
| Duplicate job delivery | Outcome table unique on `(work_order_id, assignment_version)`; second run is no-op |

### 11.3 Mock provider

Environment variable `NOTIFICATION_MOCK_MODE`:

- `success` — always succeeds
- `transient` — fails first N times
- `permanent` — always fails with non-retryable error

### 11.4 Observability

Structured logs include `jobId`, `workOrderId`, `attempt`, `correlationId`, and final status.

---

## 12. Real-time updates

### 12.1 Transport

WebSocket endpoint: `GET /api/v1/realtime` (upgrade).

### 12.2 Authentication

- Client connects with auth cookie present on handshake.
- Server validates JWT before joining room.

### 12.3 Channel model

- Room name: `org:{organisationId}`
- Event envelope:

```json
{
  "type": "work_order.updated",
  "organisationId": "...",
  "payload": { "id": "...", "status": "in_progress" },
  "timestamp": "2026-08-04T10:30:00Z"
}
```

### 12.4 Reconnection

- Client reconnects with exponential backoff.
- On reconnect, client **refetches** dashboard summary and current list page (documented fallback).
- Missed events during disconnect are acceptable; snapshot refetch restores consistency.

### 12.5 Isolation test

User from Org A must not receive events published for Org B (integration test with two WS clients).

---

## 13. Audit history

Append-only `audit_logs` table. Written by service layer on:

- Work order created / updated
- Assignment changed (before/after technician and schedule)
- Status changed
- Attachment added
- User role changed
- Notification outcome (system actor)

Fields: `organisation_id`, `actor_id` (nullable for system), `action`, `entity_type`, `entity_id`, `metadata` (JSON before/after), `created_at`.

**No UPDATE or DELETE endpoints** for audit logs.

---

## 14. CSV export

`GET /api/v1/exports/work-orders.csv?status=&priority=&...`

- Same authorisation and org scope as list endpoint.
- Streaming response (`cursor` / chunked query) — do not load all rows into memory.
- CSV escaping per RFC; prefix formula-triggering cells with `'` to prevent spreadsheet injection.
- Integration test: Org A export contains zero Org B rows.

---

## 15. API conventions

### 15.1 Base path

`/api/v1`

### 15.2 Error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": [],
    "correlationId": "req-uuid"
  }
}
```

### 15.3 Correlation IDs

- Accept `X-Correlation-ID` from client or generate UUID per request.
- Included in logs and error responses.

### 15.4 Health endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Liveness — process up |
| `GET /ready` | Readiness — Postgres + Redis reachable |

### 15.5 Graceful shutdown

On `SIGTERM`: stop accepting HTTP, drain in-flight requests, close DB pool, close Redis/BullMQ connections, exit.

---

## 16. Frontend architecture

```text
frontend/
  app/
    login/page.tsx
    dashboard/page.tsx
    work-orders/page.tsx
    work-orders/new/page.tsx
    work-orders/[id]/page.tsx
  components/          # forms, tables, status badges, upload
  lib/
    api-client.ts      # fetch wrapper, credentials: 'include'
    ws-client.ts       # reconnect + event dispatch
  hooks/               # useWorkOrders, useRealtime
```

- **TanStack Query** for server state (lists, detail, dashboard counts).
- WebSocket events invalidate relevant query keys.
- Responsive layout with CSS modules or Tailwind (implementation choice).
- Clear states: loading skeletons, empty lists, validation errors, 409 conflict modal, generic error boundary.

---

## 17. Testing strategy

| Suite | Tool | Covers |
| --- | --- | --- |
| Unit | Vitest | Zod schemas, auth helpers, CSV escaping |
| API integration | Vitest + supertest + real Postgres | Auth, roles, cross-org access, scheduling conflict, idempotency, attachments, CSV isolation |
| Concurrency | Vitest (parallel fetch) | Two simultaneous assigns → one 409 |
| Worker | Vitest + Redis | Retry transient, stop on permanent, no duplicate notification row |
| Real-time | Vitest + ws client | Org isolation on WS |
| Frontend e2e | Playwright | Login → create work order → assign → see update |

Integration tests run against Docker Postgres (same Compose stack or test profile).

---

## 18. Configuration

`.env.example` (no real secrets):

```env
# Database
DATABASE_URL=postgresql://fielddesk:fielddesk@localhost:5432/fielddesk

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=change-me-in-production
JWT_EXPIRES_IN=8h

# Attachments
ATTACHMENTS_DIR=./data/attachments
MAX_ATTACHMENT_BYTES=10485760
DEFAULT_ORG_STORAGE_LIMIT_BYTES=104857600

# Notifications
NOTIFICATION_MOCK_MODE=success

# Server
API_PORT=3001
FRONTEND_URL=http://localhost:3000
LOG_LEVEL=info
```

---

## 19. Seed data

Two organisations seeded via migration/seed script:

| Organisation | Role | Email | Password |
| --- | --- | --- | --- |
| Acme Maintenance | owner | owner@acme.test | (assessment-only; document in TECHNICAL_NOTES) |
| Acme Maintenance | dispatcher | dispatcher@acme.test | |
| Acme Maintenance | technician | tech@acme.test | |
| Beta Field Services | owner | owner@beta.test | |
| Beta Field Services | dispatcher | dispatcher@beta.test | |
| Beta Field Services | technician | tech@beta.test | |

Each org receives sample work orders in varied statuses for demo and tests.

---

## 20. Deployment and scaling notes

| Concern | Approach |
| --- | --- |
| Horizontal API scaling | Stateless JWT cookies; all state in Postgres/Redis |
| Worker scaling | Multiple worker replicas; BullMQ ensures one consumer per job |
| Database | Connection pooling (pg pool); read replicas out of scope |
| File storage | Migrate to S3 + CloudFront; quota from DB metadata |
| Monitoring | Structured logs → aggregator; metrics on queue depth, 409 rate, notification failures |
| Backups | Postgres daily snapshots + WAL; attachment bucket versioning in production |

---

## 21. Known trade-offs and limitations

| Decision | Trade-off |
| --- | --- |
| JWT in cookie without server-side session store | Cannot revoke individual tokens before expiry without a denylist (not implemented) |
| Shared-schema multi-tenancy | Simpler ops; requires strict query discipline vs separate DB per tenant |
| Local file storage | Not durable across container restarts without volume mount |
| WebSocket over SSE | Slightly more complex; better for future bidirectional features |
| 404 vs 403 on cross-org access | Hides resource existence; slightly harder to debug |

Incomplete areas at submission time will be listed in `candidate-submission/TECHNICAL_NOTES.md`.

---

## 22. Requirement traceability

| Assessment requirement | Section(s) |
| --- | --- |
| Auth, roles, org isolation | §6, §7 |
| Work order management | §5, §8, §16 |
| Concurrent scheduling | §8.2–§8.4 |
| Progress events / idempotency | §9 |
| Attachments / quotas | §10 |
| Background processing | §11 |
| Real-time updates | §12 |
| Audit history | §13 |
| CSV export | §14 |
| API / operational quality | §15, §18 |
| Automated testing | §17 |
| Local operation | §4, §18, §19 |

---

## 23. Decision log

| Date | Decision | Status |
| --- | --- | --- |
| 2026-09-08 | Adopt Next.js + Fastify + Drizzle + BullMQ stack | Accepted |
| 2026-09-08 | PostgreSQL exclusion constraint for schedule overlap | Accepted |
| 2026-09-08 | JWT in httpOnly cookie | Accepted |
| 2026-09-08 | WebSocket for real-time | Accepted |
| 2026-09-08 | Local filesystem for attachments | Accepted |
| 2026-09-08 | Stack locked (Phase 0 complete) | Accepted |
| 2026-09-08 | First-pass ERD in DATABASE_SCHEMA.md | Accepted |

Update this log when material decisions change during implementation.
