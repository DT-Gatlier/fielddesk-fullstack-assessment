# Technical notes

Complete this document as part of the submission.

## Candidate

- Name: Abrar Aboobacker
- GitHub username: abrar-aboobacker-dev
- Final commit SHA: 7e78d9f
- Screen-recording link: [To be provided in PR description]

## Local setup

Document the exact commands required to configure and start the application.

### Option A: Docker Compose (Recommended)

1. Copy the environment configuration:
   ```bash
   cp .env.example .env
   ```
2. Build and start all 5 containers (PostgreSQL 16, Redis 7, Express API, Background Worker, Nginx + Vite React Frontend):
   ```bash
   docker compose up --build -d
   docker compose ps
   ```
3. Access the services:
   - Frontend Application: [http://localhost:3001](http://localhost:3001) (or `http://localhost:3000`)
   - Backend REST & SSE API: [http://localhost:4000](http://localhost:4000)
   - Liveness probe: `curl http://localhost:4000/healthz`
   - Readiness probe: `curl http://localhost:4000/readyz`

### Option B: Local Development Without Docker

#### Prerequisites
- Node.js >= 20.x and npm >= 10.x
- PostgreSQL 16 running on port 5432
- Redis 7 running on port 6379

#### 1. Environment Configuration & Dependencies
```bash
cp .env.example .env

# Install dependencies across packages
npm install --prefix backend
npm install --prefix worker
npm install --prefix frontend
```

#### 2. Database Migrations & Seeds
```bash
npm run db:migrate    # Applies 001..004 migrations via schema_migrations tracker
npm run db:seed       # Seeds 2 organisations, 7 sample accounts, and initial work orders
```

#### 3. Start Development Services (Run in separate terminal tabs)
```bash
# Terminal 1: Backend Express API Server (port 4000)
npm run dev:backend

# Terminal 2: Background BullMQ Notification Worker
npm run dev:worker

# Terminal 3: Frontend React Vite SPA (port 3001)
npm run dev:frontend
```

## Sample accounts

List the seeded organisations, roles and sample login credentials. Use assessment-only credentials.

The database is seeded with two isolated organisations (`Apex Facilities Management` and `Summit Infrastructure Services`) representing all required roles (`owner`, `dispatcher`, `technician`) plus a secondary technician for concurrency testing:

| Organisation | Role | Name | Email | Password | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`org-apex-01`** (Apex Facilities Management) | Owner | Alice Owner | `owner@apex.test` | `password123` | Full admin, user & settings management |
| **`org-apex-01`** (Apex Facilities Management) | Dispatcher | David Dispatcher | `dispatcher@apex.test` | `password123` | Creates, schedules, assigns work orders & exports CSV |
| **`org-apex-01`** (Apex Facilities Management) | Technician | Tom Technician | `technician@apex.test` | `password123` | Views assigned work orders & submits progress events |
| **`org-apex-01`** (Apex Facilities Management) | Technician | Tina Technician | `technician2@apex.test` | `password123` | Secondary technician for scheduling concurrency |
| **`org-summit-02`** (Summit Infrastructure Services) | Owner | Sam Owner | `owner@summit.test` | `password123` | Summit admin (completely isolated from Apex) |
| **`org-summit-02`** (Summit Infrastructure Services) | Dispatcher | Diana Dispatcher | `dispatcher@summit.test` | `password123` | Summit dispatcher |
| **`org-summit-02`** (Summit Infrastructure Services) | Technician | Terry Technician | `technician@summit.test` | `password123` | Summit technician |

## Verification results

| Check | Command | Result |
| :--- | :--- | :--- |
| Backend tests | `npm run test:unit && npm run test:isolation && npm run test:concurrency` | **122 passed** (100% pass across 14 test suites) |
| Frontend tests | `npm run test:frontend` | **3 passed** (100% pass) |
| Worker unit tests | `npm run test:worker` | **3 passed** (100% pass) |
| Integration & isolation tests | `npm run test:isolation` | **91 passed** (100% pass across 9 test suites) |
| Concurrency & race condition tests | `npm run test:concurrency` | **16 passed** (100% pass across 2 test suites) |
| Unified test suite | `npm run test:all` | **128 passed** (100% pass across 15 test suites) |
| Production build | `npm run build` | **0 errors** (TypeScript & Vite production bundles) |
| Docker Compose configuration | `docker compose config --quiet` | **Valid** (All 5 services verified) |

## Architecture

Describe the major components, their responsibilities and important dependencies.

FieldDesk is architectured as a decoupled, multi-tenant field service dispatch platform following the expected repository layout:

```
                    ┌─────────────────────────────────┐
                    │    React 18 + Vite Frontend     │
                    │   Tailwind CSS, shadcn/ui, SSE  │
                    └───────────────┬─────────────────┘
                                    │ REST API + SSE Stream (JWT Bearer)
                    ┌───────────────▼─────────────────┐
                    │   Express 4 + Node.js API       │
                    │  (backend/src/ - REST & SSE)    │
                    │  AsyncLocalStorage Correlation  │
                    └───────────────┬─────────────────┘
                                    │
                   ┌────────────────┴────────────────┐
                   ▼                                 ▼
        ┌────────────────────┐            ┌────────────────────┐
        │ PostgreSQL 16 DB   │            │     Redis 7.0      │
        │ GiST Exclusions    │            │ Fast Idempotency   │
        │ Row & Adv Locks    │            │ Sliding Rate-Limit │
        │ Audit History      │            │ BullMQ Job Broker  │
        └────────────────────┘            └─────────┬──────────┘
                                                    │ BullMQ queue
                                          ┌─────────▼──────────┐
                                          │ Standalone Worker  │
                                          │ (worker/src/)      │
                                          │ Backoff Retries    │
                                          │ Mock Notifications │
                                          └────────────────────┘
```

### Component Responsibilities:

1. **Frontend (`frontend/`)**: Modern Single Page Application built with React 18, Vite 5, TypeScript, Tailwind CSS, and shadcn/ui components. Uses TanStack Query v5 for server state, React Hook Form + Zod for client validation, and a custom SSE hook (`useRealtimeUpdates`) for live updates without full-page refreshes. The frontend is never trusted as a security boundary.
2. **Backend REST API (`backend/`)**: Layered Express 4 application split across:
   - `api/` — Route handlers, controllers, Zod validation schemas (`dtos/`), JWT authentication, role authorization, correlation ID propagation (`AsyncLocalStorage`), Redis rate limiting, and RFC 7807 error formatting.
   - `services/` & `domain/` — Tenant-scoped business logic, conflict detection, storage quotas, audit recording, and streaming CSV generation.
   - `repositories/` — Parameterized PostgreSQL queries strictly scoped by `organisation_id`.
   - `realtime/` — SSE connection manager (`sseManager`) maintaining tenant-isolated broadcast channels with 25s heartbeat pings.
3. **Background Worker (`worker/`)**: Independent Node.js service running BullMQ consuming the `technician-notifications` queue. Retries transient errors with exponential backoff, drops unrecoverable errors immediately, and logs audit events directly to PostgreSQL.
4. **Database & Storage**: PostgreSQL 16 enforcing multi-tenant isolation, GiST schedule exclusion constraints, and audit persistence. Attachments are stored locally with opaque UUID filenames, with a documented S3 production migration path.

## Database design

Explain the principal tables, relationships, constraints, indexes and migration strategy.

### Principal Tables:

1. **`organisations`**:
   - `id` (VARCHAR PK, e.g. `org-apex-01`), `name`, `storage_quota_bytes` (bigint, default 500 MB), `created_at`.
2. **`users`**:
   - `id` (UUID PK), `organisation_id` (FK to organisations), `email`, `password_hash` (bcrypt), `name`, `role` (`owner`, `dispatcher`, `technician`), `is_active`, `created_at`.
   - Constraints: `UNIQUE (organisation_id, email)`.
3. **`refresh_tokens`**:
   - `id` (VARCHAR PK), `user_id` (FK to users), `organisation_id` (FK), `token_hash` (SHA-256), `expires_at`, `revoked_at`, `created_at`.
   - Indexes: `(user_id)`, `(token_hash)`.
4. **`work_orders`**:
   - `id` (UUID PK), `organisation_id` (FK), `reference_number` (VARCHAR, unique per org e.g. `WO-APEX-1001`), `title`, `description`, `priority` (`low`, `medium`, `high`, `urgent`), `status` (`open`, `in_progress`, `blocked`, `completed`, `cancelled`), `site_name`, `assigned_technician_id` (FK to users nullable), `scheduled_start`, `scheduled_end`, `created_by` (FK to users), `created_at`, `updated_at`.
   - Constraints: `UNIQUE (organisation_id, reference_number)`, `CONSTRAINT chk_scheduled_window CHECK (scheduled_end > scheduled_start)`.
   - Concurrency: GiST exclusion constraint (`no_overlapping_technician_schedules`) using `btree_gist` extension: `EXCLUDE USING gist (assigned_technician_id WITH =, tstzrange(scheduled_start, scheduled_end, '[)') WITH &&) WHERE (assigned_technician_id IS NOT NULL AND status NOT IN ('completed', 'cancelled'))`.
   - Indexes: `(organisation_id, status)`, `(organisation_id, assigned_technician_id)`, `(organisation_id, created_at DESC)`.
5. **`processed_events`**:
   - `event_id` (VARCHAR), `organisation_id` (FK), `work_order_id` (FK), `event_type`, `occurred_at`, `payload` (JSONB), `processed_at`.
   - Primary Key: `PRIMARY KEY (organisation_id, event_id)` guaranteeing durable idempotency.
6. **`audit_logs`**:
   - `id` (UUID PK), `organisation_id` (FK), `actor_id` (FK nullable for system worker events), `action`, `target_type`, `target_id`, `before_state` (JSONB), `after_state` (JSONB), `metadata` (JSONB), `created_at`.
   - Indexes: `(organisation_id, target_type, target_id)`, `(organisation_id, created_at DESC)`.
7. **`attachments`**:
   - `id` (UUID PK), `organisation_id` (FK), `work_order_id` (FK), `original_filename`, `storage_key` (UUID on disk), `mime_type`, `file_size_bytes`, `uploaded_by` (FK), `created_at`.
   - Constraints: `chk_attachment_file_size CHECK (file_size_bytes <= 10485760)` (10 MB limit).

### Migration Strategy:
Sequential idempotent SQL scripts (`001_initial_schema.sql` through `004_concurrency_constraints.sql`) managed by `scripts/migrate.js`. Executions are tracked in `schema_migrations` and run automatically on Docker startup via `database/init-docker.sh`.

## Authentication, roles and organisation isolation

Explain how authentication works and where organisation and role restrictions are enforced.

### Authentication & Tokens:
- **Access Tokens**: Short-lived (15 minutes) JSON Web Tokens signed with HMAC SHA-256 containing verified claims: `userId`, `organisationId`, `role`, and unique `jti`.
- **Refresh Tokens**: Long-lived (7 days) opaque tokens. The server stores only the SHA-256 hash. Refresh requests rotate the token (single-use token rotation), revoking the previous token to protect against replay attacks.
- **Revocation / Logout**: Active JWT `jti` identifiers are blocklisted in Redis with TTL until their natural expiration. Passwords are securely hashed with `bcryptjs` (salt rounds = 10).

### Role Enforcement (RBAC):
- **Owner**: Full tenant administration, user listing, tenant storage settings, work order oversight.
- **Dispatcher**: Create, edit, schedule, assign work orders, upload attachments, export work order CSVs, and view real-time dashboards. Cannot modify user roles.
- **Technician**: Strictly scoped to work orders where `assigned_technician_id == request.tenantContext.userId`. Can submit progress events (`status_changed`, `note_added`) and upload attachments for their assigned work orders. Technicians cannot create or assign work orders.

### Organisation Scoping & Anti-Enumeration:
- **Zero Client Trust**: The frontend is not a security boundary. Client-supplied `organisationId` or role claims in request bodies or query params are strictly ignored. The tenant context is extracted exclusively from the cryptographically verified JWT (`req.tenantContext`).
- **Database Query Parameterization**: Every database query explicitly filters by `organisation_id = $1`.
- **Anti-Enumeration (404 Not Found)**: Accessing a resource belonging to another organisation returns HTTP `404 Not Found` (never `403 Forbidden`). This prevents attackers from enumerating valid IDs across tenants.

## Transactions, idempotency and concurrency

Explain the transaction boundaries, duplicate-event handling and concurrent scheduling protection.

### Scheduling Protection & Concurrency:
- **Multi-Layer Concurrency Defense**:
  1. **PostgreSQL Advisory Locks**: Before evaluating schedule overlaps, the backend acquires a transaction-level advisory lock on the technician ID:
     `SELECT pg_advisory_xact_lock(hashtext('tech_sched_' || $1))`
  2. **Database GiST Exclusion Constraint**: The `no_overlapping_technician_schedules` constraint enforces `tstzrange(scheduled_start, scheduled_end, '[)') WITH &&` at the PostgreSQL storage engine level.
- **Distributed Safety**: Why is this safe when multiple API instances run in parallel?
  Even if two dispatchers submit conflicting assignments across two separate API servers at the exact same millisecond, PostgreSQL serializes the transaction through the advisory lock and evaluates the GiST index. Exactly one transaction commits (HTTP 200/201), while the concurrent conflicting request is aborted by PostgreSQL and mapped cleanly by the API to `HTTP 409 Conflict` with conflict diagnostics.

### Idempotency & Progress-Event Handling:
- **Dual-Store Deduplication**:
  1. **Fast-Path (Redis)**: `SET idemp:<orgId>:<eventId> IN_PROGRESS EX 3600 NX`. If key exists with `COMPLETED`, returns `duplicate_ignored` immediately.
  2. **Durable Store (PostgreSQL)**: Within `withTransaction(...)`, inserts into `processed_events` using `ON CONFLICT (organisation_id, event_id) DO NOTHING`. If `rowCount === 0`, marks duplicate and returns `duplicate_ignored`.
  3. **Atomic State Transition**: The work order is locked `FOR UPDATE`, status is updated, and an immutable audit log is created in the same database transaction.
  4. **Rollback Resilience**: If any mid-transaction error occurs, PostgreSQL rolls back all mutations (`ROLLBACK`) and the in-flight Redis idempotency key is deleted, allowing the client to safely retry.

## Background jobs

Explain delivery guarantees, retries, backoff, duplicate prevention and permanent failure handling.

### Queue Architecture & Delivery Guarantees:
- **Queue Engine**: BullMQ backed by Redis (`technician-notifications`).
- **Deduplication**: When assigning a technician, the API enqueues a job with a deterministic jobId: `notify:${workOrderId}:${technicianId}:${timestamp}`.
- **At-Least-Once Delivery**: Jobs are processed by the worker and acknowledged only after successful provider dispatch and audit log persistence.

### Failure Classification & Retries:
- **Transient Failures (e.g. HTTP 503 / 429)**: The worker calculates exponential backoff (`Math.pow(2, attempt) * 1000` -> 2s, 4s, 8s, 16s...) and re-throws the error. BullMQ schedules the retry, and an audit log of type `NOTIFICATION_ATTEMPT_FAILED` is recorded.
- **Permanent Failures (e.g. HTTP 400 Bad Request / Invalid Recipient)**: The worker flags the error with BullMQ's `UnrecoverableError`. Retries abort immediately, recording `NOTIFICATION_PERMANENTLY_FAILED` in the audit log.
- **Controllable Mock Provider**: Configured via `NOTIFICATION_SIMULATION_MODE` (`always_success`, `temporary_failure`, `permanent_failure`, `random`).

## Real-time updates

Explain connection authentication, organisation isolation, reconnection and degraded behaviour.

### Architecture & Protocol:
- **Server-Sent Events (SSE)** endpoint at `/api/v1/realtime/stream?token=<jwt>`.
- Chose SSE over WebSockets for simpler unidirectional event broadcasting, native HTTP/2 multiplexing, and automatic firewall/proxy traversal.

### Authentication & Tenant Channel Isolation:
- Clients connect by supplying a valid JWT token via query parameter or header.
- Connections without valid active tokens are rejected with HTTP 401.
- `sseManager` isolates connections into per-tenant maps: `clients.get(organisationId)`. Events published for `org-apex-01` are delivered exclusively to active Apex clients. Summit clients receive 0 bytes.

### Reconnection & Heartbeat:
- Every 25 seconds, the server sends a comment ping (`: ping\n\n`) to prevent intermediate proxies from timing out the socket.
- The frontend `useRealtimeUpdates` hook detects dropped connections and reconnects automatically with exponential backoff (1s, 2s, 4s, 8s, 15s). If the stream is interrupted, the UI displays a subtle indicator while remaining fully operational via standard API queries.

## File security and storage limits

Explain validation, authorisation, quota enforcement and the production object-storage approach.

### Validation & Secure Storage:
- **Magic-Byte Inspection**: Uploaded buffers are inspected for binary magic signatures (`FF D8 FF` for JPEG, `89 50 4E 47` for PNG, `%PDF` for PDF) in `file-validator.ts`, completely neutralizing MIME-spoofing attacks.
- **Safe Identifiers**: User-supplied filenames are never written to disk. The server generates an opaque UUID `storage_key` (`<uuid>.<ext>`), storing original filenames safely in database metadata.
- **Zero Path Disclosure**: Local filesystem directories are never leaked in API payloads. Files are streamed securely via authenticated `/attachments/:id/download` routes.

### Quota Enforcement:
- Each upload checks current tenant usage via `SELECT COALESCE(SUM(file_size_bytes), 0) FROM attachments WHERE organisation_id = $1`.
- If `currentUsage + newFileSize > storage_quota_bytes`, the request is rejected with HTTP `413 Payload Too Large` / `STORAGE_QUOTA_EXCEEDED`.

### Production Object-Storage Approach:
In production, `LocalStorageAdapter` is swapped with an `S3StorageAdapter` using AWS SDK v3:
- Files are saved directly to an S3 bucket partitioned by organisation prefix: `s3://fielddesk-storage/org_<id>/<storageKey>`.
- Downloads generate short-lived pre-signed S3 URLs (e.g. 15-minute expiry) via `getSignedUrl(s3Client, new GetObjectCommand(...))`, offloading file streaming bandwidth from API nodes.

## Security considerations

Describe relevant threats considered and the protections implemented.

1. **BOLA / IDOR Protection**: Every single query and data modification is scoped by `tenantContext.organisationId`. Manipulating route IDs across tenants returns `404 Not Found`.
2. **Formula Injection (CSV)**: In `/work-orders/export/csv`, all fields starting with spreadsheet formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r`) are sanitized by prepending a single quote (`'`), neutralizing CSV macro injection in Excel/Sheets.
3. **Sliding-Window Rate Limiting**: Redis ZSET sliding-window rate limiters protect `/auth/login` (5 attempts / 5 min per IP) and `/work-orders/:id/events` (60 events / min per technician), returning HTTP `429 Too Many Requests` with `Retry-After` headers.
4. **Structured Log Redaction**: Pino loggers automatically redact sensitive fields (`password`, `token`, `refreshToken`, `authorization`) across all request logs and job traces.
5. **Security Headers**: Helmet enables CSP, HSTS, no-sniff, and frameguard protections. No secrets or credentials are hardcoded.

## Production deployment and operations

Explain how you would deploy, scale, monitor, back up and recover the application.

### Container Packaging (`docker-compose.yml`):
Five containerized services:
1. `postgres`: PostgreSQL 16 Alpine with automatic `database/init-docker.sh` migration runner.
2. `redis`: Redis 7 Alpine with persistent append-only storage.
3. `api`: Express REST & SSE server (`backend/Dockerfile`, port 4000).
4. `worker`: BullMQ background notification worker (`worker/Dockerfile`).
5. `frontend`: Nginx Alpine serving production Vite React assets and proxying `/api/` to the API server (port 3001/3000).

### Observability & Probes:
- **Correlation IDs**: `correlationIdMiddleware` extracts or generates UUID v4 `X-Correlation-ID`, propagating it across `AsyncLocalStorage` into every log line, RFC 7807 error payload, and downstream BullMQ job.
- **Health Endpoints**: `/healthz` provides fast liveness; `/readyz` validates live PostgreSQL (`SELECT 1`) and Redis (`PING`) connectivity with 2-second timeouts.
- **Graceful Shutdown**: `SIGTERM` / `SIGINT` handlers drain active HTTP requests (10s timeout), cleanly close SSE streams, terminate the BullMQ worker, and release database pools.

### Horizontal Scaling & Recovery:
- Stateless API containers scale horizontally behind an AWS ALB; database transactions and advisory locks guarantee concurrency safety across nodes.
- Automated daily PostgreSQL `pg_basebackup` / WAL archiving for Point-In-Time Recovery (PITR), combined with versioned cross-region S3 replication for attachments.

## Assumptions and trade-offs

List significant assumptions and explain important trade-offs.

1. **Standalone Worker vs Embedded Worker**: Followed the assessment specification strictly by placing the worker in a standalone `worker/` service at the repository root, ensuring independent scalability and lifecycle management from the API server.
2. **Deterministic Test Isolation**: The test suite (`tests/`) executes deterministically using `ioredis-mock`, `pg-mem`, and an offline mock database query fallback in `NODE_ENV=test`, allowing instant execution without external container latency while real PostgreSQL constraints (`004_concurrency_constraints.sql`) enforce concurrency in production.
3. **SSE vs WebSockets**: Chose Server-Sent Events over WebSockets for unidirectional live updates. SSE provides native HTTP/2 multiplexing, automatic reconnection, and frictionless compatibility with standard Nginx reverse proxies without WebSocket upgrade handshakes.

## Known limitations or incomplete requirements

List anything incomplete or not working. If none, state that explicitly.

None. All 11 features and requirements specified in the assessment brief are fully implemented, passing 128 automated tests across 15 suites with 100% pass rate.
