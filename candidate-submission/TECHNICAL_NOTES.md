# Technical notes

## Candidate

- Name: Suhail KC
- GitHub username: suhailkc
- Final commit SHA: _(update before PR — run `git rev-parse HEAD` on submission branch)_
- Screen-recording link: _(add before PR submission)_

## Local setup

### Docker (recommended)

```bash
cp .env.example .env
npm run dev          # starts postgres, redis, api, worker, frontend
npm run migrate      # in another terminal if needed on first run
npm run seed
```

Stop: `npm run dev:down`

### Local processes (app only)

```bash
docker compose up postgres redis -d
cp .env.example .env
npm install --prefix backend && npm install --prefix worker && npm install --prefix frontend
npm run migrate && npm run seed
npm run backend:dev   # :3001
npm run worker:dev    # BullMQ consumer
npm run frontend:dev  # :3000
```

### Verification

```bash
npm test              # 36 backend integration tests (requires Postgres + seed)
npm run typecheck     # backend + frontend TypeScript
npm run build         # backend tsc + Next.js production build
```

| Check | Command | Result |
| --- | --- | --- |
| Backend tests | `npm test` | 36 passed (real PostgreSQL) |
| Frontend tests | N/A | Workflow covered by `critical-workflow.test.ts` |
| Integration tests | `npm test` | Same suite — all use real Postgres |
| Lint / typecheck | `npm run typecheck` | Passes |
| Build | `npm run build` | Passes |

## Sample accounts

Password for all seeded users: **`FieldDesk2026!`** (assessment only).

| Organisation | Email | Role |
| --- | --- | --- |
| Acme Field Services | `owner@acme.test` | owner |
| Acme Field Services | `dispatcher@acme.test` | dispatcher |
| Acme Field Services | `tech@acme.test` | technician |
| Beta Maintenance Co | `owner@beta.test` | owner |
| Beta Maintenance Co | `dispatcher@beta.test` | dispatcher |
| Beta Maintenance Co | `tech@beta.test` | technician |

## Architecture

Three-process monorepo:

| Process | Stack | Responsibility |
| --- | --- | --- |
| `frontend/` | Next.js 14, TypeScript | Login, dashboard, work orders, attachments, real-time UI |
| `backend/` | Fastify 5, TypeScript | REST + WebSocket API, auth, business logic |
| `worker/` | BullMQ, TypeScript | Async notification delivery |

Shared infrastructure: **PostgreSQL** (source of truth), **Redis** (job queue only).

See [docs/ARCHITECTURE_DECISIONS.md](../docs/ARCHITECTURE_DECISIONS.md) for full rationale.

## Database design

Seven SQL migrations in `database/migrations/`:

1. Extensions and enums
2. Organisations and users
3. Work orders and audit logs
4. Scheduling exclusion constraint (`tstzrange` overlap)
5. Progress events (idempotency key on `event_id`)
6. Attachments and org storage quotas
7. Notification deliveries (dedupe on work order + assignment version)

Principal relationships: organisations → users, work orders, audit logs, attachments. Work orders reference assigned technicians within the same org. See [docs/DATABASE_SCHEMA.md](../docs/DATABASE_SCHEMA.md).

## Authentication, roles and organisation isolation

- Login: `POST /api/v1/auth/login` → argon2 verify → JWT in httpOnly `access_token` cookie.
- Middleware attaches `{ userId, organisationId, role }` from verified JWT only.
- **Never** trust client-supplied organisation IDs.
- Roles: `owner`, `dispatcher` (manage work orders), `technician` (assigned orders only).
- Cross-org resource access returns **404** (no enumeration).

## Transactions, idempotency and concurrency

### Concurrent scheduling protection (Phase 4)

Overlapping technician assignments prevented by transaction + `FOR UPDATE` overlap query + PostgreSQL exclusion constraint. Safe with multiple API instances — coordination in Postgres only. See [docs/SCHEDULING_CONCURRENCY.md](../docs/SCHEDULING_CONCURRENCY.md).

### Progress event idempotency (Phase 5)

`POST /api/v1/progress-events` with client `eventId`. Unique index + `ON CONFLICT DO NOTHING`; side effects and audit only on first accept. Full transaction rollback on failure.

## Background jobs

BullMQ queue `notifications` enqueued on work order assignment. Deterministic job ID `notify:{workOrderId}:{assignmentVersion}`. Worker process separate from API. Mock provider modes: success / transient / permanent. Dedupe via DB unique constraint + skip-if-sent.

## Real-time updates

WebSocket `/api/v1/realtime` with JWT cookie auth. Org-scoped in-memory rooms. Frontend reconnect with exponential backoff and snapshot refetch.

## Audit history and CSV export

Append-only `audit_logs` — create, assign, status, attachment, progress, notification outcomes. No edit/delete API.

Streaming CSV export at `/api/v1/exports/work-orders.csv` with list-equivalent auth and filters.

## File security and storage limits

Local disk storage under `ATTACHMENTS_DIR`. Magic-byte validation (JPEG, PNG, PDF). UUID filenames on disk. Org quota enforced in transaction. Authenticated download only.

Production migration path: S3-compatible object storage adapter keeping DB metadata and quota logic.

## API and operational quality

- Zod validation on bodies and UUID path params
- Error envelope with correlation IDs (`x-correlation-id` header)
- Pino structured logging
- Graceful SIGTERM/SIGINT shutdown (API + worker)
- Zod-validated environment config

## Security considerations

Tenant isolation, httpOnly cookies, rate-limited login, attachment validation, CSV formula injection prefixing, org-scoped WebSocket rooms, no secrets in source control.

## Production deployment and operations

- **Deploy:** containerise api, worker, frontend; managed Postgres + Redis; object storage for attachments.
- **Scale:** stateless API replicas behind load balancer; single logical Postgres; Redis for queue; WebSocket sticky sessions or Redis pub/sub adapter (not implemented — in-memory rooms are single-instance only).
- **Monitor:** health/readiness endpoints, structured logs, queue depth, notification failure rate.
- **Backup:** Postgres PITR; attachment bucket versioning; tested restore runbooks.

## Assumptions and trade-offs

- Real-time uses in-memory rooms (simple for assessment; would need Redis adapter for multi-instance).
- Attachments on local disk (acceptable locally; S3 for production).
- No role-change API (seeded roles only).
- Frontend tests deferred in favour of backend integration tests covering critical workflow.
- Notification provider is mocked.

## Known limitations or incomplete requirements

- **WebSocket scaling:** org rooms are process-local; horizontal API scaling would require a shared pub/sub layer.
- **User role changes:** no API to change roles (not required by brief).
- **Screen recording and PR:** candidate must complete before final submission.
- **Frontend E2E browser test:** critical workflow verified via API integration test instead of Playwright.

Everything else in the assessment brief is implemented and tested.
