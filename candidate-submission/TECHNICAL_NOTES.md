# Technical notes

## Candidate

- Name:
- GitHub username: Believer0012
- Final commit SHA:
- Screen-recording link:

## Local setup

```bash
cp .env.example .env          # optional; Compose has defaults
docker compose up --build     # postgres, redis, migrate (+seed), api, worker, web
```

- Web app: http://localhost:8080
- API: http://localhost:3000 (readiness: `/health/ready`)
- Reset all data: `docker compose down -v`

To run without Docker, use `database/local-setup.sql` and the `dev:*` scripts. See [README](../README.md#running-without-docker).

## Sample accounts

All accounts use the password `FieldDesk!2026`, an assessment-only value set by `SEED_PASSWORD`.

| Organisation | Owner | Dispatcher | Technicians |
| --- | --- | --- | --- |
| Northwind Facilities | owner@northwind.test | dispatcher@northwind.test | tech1@northwind.test, tech2@northwind.test |
| Harbor Maintenance Co | owner@harbor.test | dispatcher@harbor.test | tech1@harbor.test |

## Verification results

| Check | Command | Result |
| --- | --- | --- |
| Backend tests | `npm run test:backend` | 11 files, **109 passed**, 0 failed (run 4× in a row with no flakes) |
| Frontend tests | `npm run test:frontend` | 2 files, **2 passed** (session lifecycle: no session → login → dashboard → logout; create work order → validation → schedule conflict → success) |
| Integration tests | Part of the backend suite: real PostgreSQL + Redis, HTTP via `inject`, real WebSockets, real BullMQ | Included above |
| Lint | `npm run lint` | ESLint + `tsc --noEmit`, both workspaces: **0 problems** |
| Build | `npm run build` | API/worker `tsc` and Vite production build: **success** |
| End-to-end smoke test | Scripted run against the live API, worker and Vite proxy | **21/21 checks passed**: login for both orgs, cross-org 404s, scheduling conflict, idempotent event replay, upload and type rejection, CSV, worker retries (2 failures then success), real-time isolation, logout revocation |

Environment for these runs: Windows 11, Node 22.15, PostgreSQL 18.6 and Redis 8.10. The Compose stack pins PostgreSQL 17 and Redis 7.4. Docker could not be run on the development machine because WSL was not installed, so `docker compose up --build` was not executed there.

## Architecture

```text
 browser ──► web (nginx: SPA + /api reverse proxy, WebSocket upgrade)
               │
               ▼
             api (Fastify) ──► PostgreSQL  (source of truth; RLS; constraints)
               │   ▲              ▲
               │   │ pub/sub      │
               ▼   │              │
             Redis ───────────► worker (BullMQ) ──► mock notification provider
         (queue, pub/sub,
          rate-limit counters)
```

- **api** is stateless HTTP and WebSocket. It authenticates, validates and authorises each request, then performs the change in a single PostgreSQL transaction. Only after the commit does it enqueue jobs and publish real-time hints. Any number of instances can run side by side.
- **worker** is a separate process built from the same codebase (`backend/src/worker.ts`). It consumes the `fielddesk-notifications` queue, calls the provider, and records every attempt and outcome. It also runs a recovery sweep every 30 seconds.
- **PostgreSQL** holds all durable state. Invariants live in the database: tenant RLS, composite foreign keys, the no-overlap exclusion constraint, unique idempotency keys and append-only triggers.
- **Redis** carries BullMQ jobs, cross-instance pub/sub for real-time messages, and rate-limit counters. It holds nothing that cannot be rebuilt.
- **web** is nginx serving the built SPA and proxying `/api`, so the browser sees a single origin.

Important internal modules:
- `db/pool.ts` provides `withOrg()`, which wraps every tenant operation in a transaction with `app.org_id` set.
- `effects.ts` collects side effects to run after the commit.
- `work-orders/query.ts` is the shared filter builder used by both the list endpoint and the CSV export.
- `http/errors.ts` holds the error types and the central error handler.

## Database design

Migrations are plain SQL files in `database/migrations`, applied in order by `backend/src/db/migrate.ts`. Each file runs in its own transaction together with its `schema_migrations` row. A Postgres advisory lock serialises concurrent runners, and checksums detect edits to migrations that have already been applied. The policy is forward-only: changes ship as new files.

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `organisations` | Tenant; storage limit and usage counter; work-order reference counter | `storage_used_bytes >= 0` |
| `users` | Users with role `owner \| dispatcher \| technician` | Globally unique lower-case email; `UNIQUE (org_id, id)` as the composite-FK target |
| `sessions` | Server-side sessions; stores only `sha256(token)` | FK `(org_id, user_id) → users` |
| `work_orders` | Core entity | `UNIQUE (org_id, reference)`; composite FKs to technician and creator in the same organisation; schedule pair and order CHECKs; **`EXCLUDE USING gist (assigned_technician_id WITH =, tstzrange(start, end, '[)') WITH &&) WHERE (assigned AND scheduled AND status <> 'cancelled')`**; `version` for optimistic locking |
| `progress_events` | Immutable record of accepted technician events | **`UNIQUE (org_id, event_id)`**; `request_hash`; `outcome applied \| stale`; append-only trigger |
| `attachments` | File metadata; bytes live in storage | Server-generated unique `storage_key`; allowed content types CHECK |
| `audit_log` | Organisation, actor, action, target, before/after, request id | Append-only trigger, and the runtime role has only SELECT/INSERT |
| `notifications` | One row per assignment notification | `UNIQUE (org_id, dedupe_key)` where the key is `workOrder:technician:version` |
| `notification_attempts` | Every delivery attempt with outcome and duration | `UNIQUE (notification_id, attempt_number)`; append-only |

**Composite foreign keys.** Every child table references its parent as `(org_id, id)`, for example `work_orders(org_id, assigned_technician_id) → users(org_id, id)`. The database itself therefore rejects a reference to another organisation's technician, work order or user, even if application code had a bug.

**Indexes.** These follow the actual access paths: `(org_id, created_at DESC, id)` for the default list order, `(org_id, status)`, `(org_id, priority)`, `(org_id, assigned_technician_id, scheduled_start)`, `(org_id, scheduled_start)`, a trigram GIN index for `ILIKE '%term%'` search, `(org_id, target_type, target_id, created_at)` for activity history, a partial index on pending notifications, and the GiST index behind the exclusion constraint.

## Authentication, roles and organisation isolation

**Login and passwords.** Login checks the password against an **scrypt** hash (N=2^15, r=8, p=1, 16-byte salt; the parameters are stored with each hash so they can be raised later). Unknown emails are verified against a dummy hash so timing is similar, and they return the same `401 INVALID_CREDENTIALS` as a wrong password.

**Sessions.** A successful login creates a 256-bit random token. The client receives it in an `HttpOnly`, `SameSite=Strict` cookie (`Secure` when `COOKIE_SECURE=true`); the server stores only its SHA-256 hash. Server-side sessions mean logout, expiry and deactivation take effect immediately.

**Per-request identity.** On every request, `authenticate` resolves the session through `auth_resolve_session()`, which returns the user's **current** `org_id` and `role` from the database. Nothing about organisation or role is ever read from the request. Request schemas are `.strict()`, so a body containing `orgId`, `role` or `createdBy` is rejected with 400.

**Role enforcement.** Roles are checked on the server with `requireRole(...)` for each route. Technician scoping (only assigned work) happens inside `loadWorkOrder()` and the shared list filter builder, so reads, edits, events, attachments, downloads, the dashboard, the export and real-time delivery all apply the same rule. A resource in another organisation, or one not assigned to the technician, returns **404 rather than 403**, so its existence is not revealed.

**Defence in depth: row-level security.** The API connects as `fielddesk_app`, a non-owner role subject to RLS policies `org_id = current_setting('app.org_id')`. `withOrg()` sets that value with `set_config(..., true)`, which is transaction-local and therefore safe with pooled connections. With no setting the role sees zero rows. Login and session lookups happen before the organisation is known, so they go through two narrow `SECURITY DEFINER` functions. Tests prove that a query without any `WHERE org_id` still returns only the current organisation's rows, and that writing another organisation's `org_id` fails.

**CSRF.** Mutations are protected by `SameSite=Strict` and by rejecting any request whose `Origin` header differs from `WEB_ORIGIN`. The WebSocket handshake gets the same Origin check, which prevents cross-site WebSocket hijacking.

## Transactions, idempotency and concurrency

**Scheduling conflicts.** The guarantee comes from the `work_orders_no_technician_overlap` exclusion constraint. Two concurrent transactions inserting overlapping ranges for the same technician conflict inside the GiST index: the second waits for the first and then fails with `23P01`. The service converts that error into `409 SCHEDULE_CONFLICT` and lists the conflicting work orders.

Because Postgres enforces the rule at commit time, it holds for any number of API instances, connections and code paths. No application lock, `SELECT … FOR UPDATE` or serialisable isolation is required. Ranges are half-open `[start, end)`, so back-to-back jobs are allowed, and cancelled work orders are excluded. Tests cover:
- eight simultaneous assignments, of which exactly one succeeds;
- conflicting creates spread across **two separate app instances with separate connection pools**;
- that the losing requests leave no notifications or audit rows behind.

**Lost updates.** Edits carry `version`. The update locks the row (`FOR NO KEY UPDATE`) and rejects a stale version with `409 VERSION_CONFLICT`.

**Progress events: idempotency and transaction boundary.** Everything for one event happens in **one transaction**:

1. Lock the work order. It is visible only if it belongs to the caller's organisation and is assigned to them; otherwise the result is 404.
2. If `(org_id, event_id)` already exists, compare the stored `request_hash`. A match means a replay, which returns `200` with `outcome: "duplicate"` and the header `Idempotent-Replayed: true`. A mismatch returns `409 IDEMPOTENCY_KEY_REUSED`.
3. Validate the status transition (invalid → 422). Detect out-of-order events: a `status_changed` older than the last applied one is stored as `stale` and not applied.
4. `INSERT … ON CONFLICT (org_id, event_id) DO NOTHING`, then update the work order (bumping `version`) and write the audit entry.

**Simultaneous duplicates.** The unique constraint is the arbiter. Duplicates for the same work order already serialise on the row lock and take the step-2 path. Any other race makes the second insert wait for the first transaction; if that commits, the insert returns no row and the request is answered as a duplicate. The test fires 10 identical requests at once and asserts one `201`, nine `200`, exactly one stored event, one audit row and `version = 2`.

**Rollback.** Any failure, such as an invalid transition or a database error, rolls back the event row, the status change and the audit entry together. Because nothing was stored, a client retry with the same `eventId` succeeds. The rollback test installs a trigger that makes the final audit insert fail and then asserts that nothing was persisted.

**After-commit effects.** Queue jobs and real-time messages are collected during the transaction and dispatched only after the commit (`effects.ts`), so a rolled-back change can never notify anyone.

**Quotas.** `UPDATE organisations SET used = used + $n WHERE id = $1 AND used + $n <= limit` is a single atomic check-and-reserve. Under READ COMMITTED, concurrent uploads queue on the row and the WHERE clause is re-evaluated against the newest committed value. The test uploads 6 × 1000 bytes concurrently against a 2500-byte limit and gets exactly two successes.

## Background jobs

- **Enqueue.** Assignment, reassignment and rescheduling insert a `notifications` row (status `pending`) **in the same transaction** as the change. After the commit the API adds a BullMQ job whose `jobId` is the notification id. Re-adding a job that already exists is a no-op.
- **Reliability.** If the enqueue fails (Redis down, or the process crashes between commit and enqueue), the row stays `pending`. The worker's **recovery sweep** re-enqueues pending notifications untouched for more than 2 minutes, using the `notifications_due_for_dispatch()` SECURITY DEFINER function, which returns ids only. This is a transactional-outbox pattern without a separate outbox table.
- **Retries and backoff.** By default there are 5 attempts with exponential backoff starting at 2 s (`NOTIFICATION_MAX_ATTEMPTS`, `NOTIFICATION_BACKOFF_MS`).
- **Temporary vs permanent failures.** The provider raises `ProviderError(kind)`. A `temporary` error is recorded as an attempt, committed, and rethrown so BullMQ retries. A `permanent` error marks the notification `failed` immediately and is not retried. Unknown errors are treated as temporary. After the final attempt the notification is marked `failed`. A malformed job payload throws BullMQ's `UnrecoverableError` and fails once without retries.
- **No duplicates.** The processor locks the notification row `FOR UPDATE` and skips anything not `pending`, so redelivery, stalled-job recovery and the sweep cannot send twice. The provider also receives the notification id as an **idempotency key**, which covers a crash after the provider accepted the message but before the worker committed. The mock provider honours the key just as real providers do. If the work order was reassigned or cancelled before delivery, the notification is marked failed (`assignment superseded`) and not sent.
- **Records.** Every attempt goes into `notification_attempts` (outcome, error, duration). The final outcome is written to `audit_log` as `notification.sent` or `notification.failed` (system actor) and appears in the work order's activity history.
- **Logs.** Logs are structured pino JSON, including `notificationId`, `orgId`, attempt number, outcome and error.
- **Delivery guarantee.** At-least-once delivery to the processor, effectively exactly-once to the recipient through the row lock and the provider idempotency key.
- **Holding the row lock during the provider call** keeps concurrent duplicate sends impossible. The cost is a database connection held for up to the provider timeout. At higher volume I would switch to a short "claim" transaction (`pending → sending` with a lease) and rely on the idempotency key alone.

## Real-time updates

- **Transport.** A WebSocket at `/api/realtime` (`@fastify/websocket`).
- **Authentication.** The handshake requires a valid session cookie and an `Origin` equal to `WEB_ORIGIN`; otherwise it gets 401 or 403 before the upgrade. Every heartbeat (30 s) pings the client, terminates dead connections, and **re-validates the session**: after logout, expiry, deactivation or a change of organisation the socket is closed with code 4401, and role changes take effect on the next heartbeat.
- **Isolation.** After commit, the API publishes to the Redis channel `fielddesk:org:<orgId>`. Each instance subscribes once and delivers a message only to sockets registered under the organisation **taken from their session**, so a message cannot reach another tenant. Technicians receive events only for work orders assigned (or previously assigned) to them.
- **Payload.** Messages are minimal hints (ids, reference, status). Clients refetch through the REST API, which applies full authorisation, so a mis-delivered hint could not leak data.
- **Reconnection.** The client reconnects with capped exponential backoff and jitter (1 s up to 30 s). On reconnect it invalidates all cached queries, because events sent while it was offline were missed.
- **Degraded behaviour.** While disconnected, the header shows "Offline" and the dashboard and lists **poll every 30 seconds**. Refetch-on-focus also applies. If Redis pub/sub is down, writes still succeed (publishing is best-effort and logged) and clients fall back to polling. Real-time delivery is a convenience, never a source of truth.
- **Tests** cover unauthenticated and foreign-origin rejection, two organisations plus a technician (org B and the unassigned technician receive nothing), delivery across two API instances, reconnection, and socket closure after logout.

## File security and storage limits

- **Validation.** The multipart upload is limited to one file of at most `MAX_ATTACHMENT_BYTES` (10 MB by default). The type comes from **magic bytes** (PNG, JPEG, WebP, PDF); the client's Content-Type and file extension are ignored. A fake `.png` is rejected with 415, and an oversized file with 413.
- **Streaming.** The file streams through a transform that sniffs the type, computes SHA-256 and counts bytes, writing to storage without buffering the whole file in memory.
- **Naming.** Storage keys are `<orgId>/<uuid>`, generated by the server. The storage driver rejects any key not matching that pattern and opens files with `wx`, so they are never overwritten. The original filename is reduced to its basename, stripped of control characters, used only for display and `Content-Disposition` (RFC 5987), and never as a path.
- **Authorisation.** Upload and download use the same work-order visibility rule as everything else (organisation; assigned technician only). Responses never contain the storage key or any filesystem path.
- **Download headers.** `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cache-Control: private, no-store`.
- **Quota.** The reservation is atomic (see above) and happens after the bytes are written. If the quota check or anything later fails, the stored object is deleted. Owners can change the limit through `PATCH /api/organisation`.
- **Production object storage.** `StorageDriver` (`write`, `read`, `remove`) would be implemented on S3-compatible storage:
  - stream uploads to a private bucket under the same keys, with server-side encryption;
  - serve downloads either by streaming through the API or, at scale, with short-lived pre-signed GET URLs issued only after the same authorisation check (with `response-content-disposition` set);
  - ideally run uploads through an `incoming/` prefix with malware scanning before promotion.
- **Orphaned files.** A crash between the file write and the commit could leave an orphaned object. A periodic job that lists keys absent from `attachments` (or a bucket lifecycle rule on `incoming/`) would clean these up; this is not implemented.

## Security considerations

| Threat | Mitigation |
| --- | --- |
| Cross-tenant access by changing ids or payloads | Organisation comes from the session only; `.strict()` schemas; org-scoped queries; composite FKs; Postgres RLS; 404 for foreign ids; tests for each surface |
| Privilege escalation | Server-side role checks on every route; role re-read from the database on every request and every WebSocket heartbeat |
| Credential stuffing or brute force | Rate limit of 10 login attempts/min/IP (Redis-backed, shared across instances); scrypt; uniform error and timing |
| Session theft | HttpOnly, SameSite=Strict, Secure (configurable); only hashes stored; server-side revocation; TTL |
| CSRF / cross-site WebSocket hijacking | SameSite=Strict plus an Origin check on mutations and the WebSocket handshake |
| SQL injection | Parameterised queries only; sort columns whitelisted; LIKE wildcards escaped |
| Malicious uploads, path traversal | Magic-byte allow-list, size limit, server-generated keys, key pattern check, nosniff and sandbox CSP on downloads |
| CSV / formula injection | Cells starting with `= + - @ \t \r` are prefixed with `'` and quoted |
| Event flooding | Per-session rate limit on progress events |
| Log leakage | Cookie, authorization and set-cookie headers and passwords are redacted |
| Secrets | `.env` is git-ignored; `.env.example` holds placeholders only; seeding refuses `NODE_ENV=production` |
| Audit tampering | Audit, event and attempt tables are append-only (no UPDATE/DELETE grant plus a trigger that also blocks the table owner) |

## Production deployment and operations

- **Deploy.** Build one image for api, worker and migrate, and one for web. Run them on a container platform (ECS, Kubernetes or Fly), with migrations as a pre-deploy job: forward-only and backward-compatible, using expand/contract for breaking changes. Use managed PostgreSQL with a replica and PITR, and managed Redis. TLS terminates at the load balancer, with `COOKIE_SECURE=true` and `trustProxy` enabled.
- **Scale.** The API is stateless (sessions in Postgres, real-time fan-out via Redis), so it scales horizontally behind a load balancer; WebSockets need no sticky sessions. Workers scale by replica count and `concurrency`. Postgres is the bottleneck to watch:
  - put PgBouncer in transaction mode in front of it (compatible with transaction-local `set_config`);
  - read replicas could serve list and export queries;
  - partition `audit_log` by month at high volume.
- **Monitor.** Ship structured JSON logs carrying request ids to a log store. Track:
  - RED metrics per route;
  - Postgres connections, lock waits and slow queries;
  - BullMQ queue depth, failed-job count, and age of the oldest pending notification (the sweep makes this a good alert);
  - real-time connection count;
  - `/health/ready` for the load balancer and `/health/live` for restarts.
  
  Alert on readiness failures, 5xx rate, queue age and notification failure rate. Add OpenTelemetry tracing that propagates `x-request-id`.
- **Back up and recover.** Postgres is the only system of record. Use automated daily snapshots plus WAL archiving for point-in-time recovery, and run regular restore drills to a scratch instance. Version or replicate the object storage bucket across regions. Redis is not backed up for recovery:
  - pending notifications are rebuilt from `notifications` by the sweep;
  - rate-limit counters and pub/sub are ephemeral.

## Assumptions and trade-offs

- **Email is globally unique.** Login identifies the organisation from the email alone. Supporting one email across several organisations would need an organisation picker after login.
- **Server-side sessions over JWTs.** This gives immediate revocation and role changes, at the cost of one indexed lookup per request.
- **Optimistic locking for edits, a database constraint for scheduling.** The constraint is simpler and stronger than application locks, and it stays correct across instances.
- **Notifications fire on assignment and rescheduling.** They are not sent for other edits.
- **Technician status changes go only through progress events.** Technicians can set `in_progress`, `on_hold` and `completed` within the transition rules. Dispatchers manage all statuses through edits.
- **Out-of-order status events.** These are stored but not applied (`stale`), and notes are always recorded. An alternative would be rejecting them, which is worse for offline mobile clients.
- **Offset pagination.** Simple and adequate at this scale. Keyset pagination would be the next step for very large tenants. The CSV export already uses a server-side cursor.
- **The worker shares the backend codebase.** This avoids duplicating data-access code while remaining a separate process.
- **Organisation creation is seed-only.** There is no sign-up flow.

## Known limitations or incomplete requirements

- **Compose stack not run end to end.** The Docker Compose stack (Dockerfiles, nginx proxy, first-boot role script) was written but **not executed** on the development machine, which has no WSL. Every component was verified natively against PostgreSQL 18 and Redis 8 instead (see Verification results).
- **Orphaned files.** Stored objects left by a crash between file write and commit are not cleaned up automatically (the approach is described above).
- **Session lifetime.** Sessions have a fixed TTL with no sliding renewal, and there is no "log out all sessions" endpoint.
- **Password management.** There is no password reset or change flow; owners set initial passwords.
- **Real-time revalidation lag.** Revalidation runs on the 30-second heartbeat, so a revoked session's socket can stay open for up to one interval (it receives only change hints, never data).
- **Frontend tests.** These cover two workflows: the session lifecycle, and creating a work order with a scheduling conflict. Other screens are verified manually and through the API tests.
- **Rate limiting fails open.** If Redis is unavailable, rate limiting is skipped (`skipOnError`) rather than blocking all logins. Readiness reports the outage.
