# Technical notes

Complete this document as part of the submission.

## Candidate

- Name:
- GitHub username:
- Final commit SHA:
- Screen-recording link:

## Local setup

```bash
cp .env.example .env
npm install
docker compose up -d postgres redis
npm run db:migrate
npm run db:seed
npm run dev
# In another terminal:
npm run worker:dev -w backend
# In a third terminal:
npm run frontend:dev
```

## Sample accounts

Two organisations are seeded: `northwind` and `contoso`. Each has `owner@<slug>.test`, `dispatcher@<slug>.test`, and `technician@<slug>.test`. All use assessment-only password `FieldDesk123!`.

## Verification results

| Check | Command | Result |
| --- | --- | --- |
| Backend tests | `npm test` | Passing |
| Frontend tests | `npm run test -w frontend` | Passing |
| Integration tests | `TEST_DATABASE_URL=... npm test` | Implemented; requires migrated PostgreSQL test database |
| Lint | `npm run lint` | Passing |
| Build | `npm run build` | Passing |

## Architecture

The backend uses Node.js 22, Express 5, strict TypeScript, PostgreSQL/`pg`, Redis/BullMQ, Zod, Argon2id, JWT, Pino, and Multer. The API and independent worker are separate processes. Modules separate authentication, administration, dynamic resources, work orders, progress events, attachments, reporting, real-time delivery, and notifications. See `docs/BACKEND.md`.

## Database design

Every tenant-owned table has `organisation_id`. Composite foreign keys prevent cross-organisation relationships. The PostgreSQL exclusion constraint prevents schedule overlap. Progress-event uniqueness supplies idempotency, and the notification tables implement a transactional outbox foundation. See `docs/DATABASE.md`.

## Authentication, roles and organisation isolation

Argon2id password login issues short-lived HS256 JWTs with issuer/audience constraints and a rotating refresh session. Only a refresh-token hash is stored. Middleware verifies both the access token and current user/token version. Logout revokes sessions and increments token version. Controllers and repositories derive organisation scope and role from verified identity.

## Transactions, idempotency and concurrency

Work-order writes group the record, audit entry, and notification outbox entry in a transaction. A GiST exclusion constraint provides database-level schedule safety. Progress-event insert, status update, and audit entry are atomic; `(organisation_id, event_id)` and conflict-safe insertion handle simultaneous duplicates.

## Background jobs

Assignment writes a deduplicated PostgreSQL outbox row in the same transaction. The independent worker dispatches to BullMQ using deterministic job IDs. BullMQ provides Redis leases, worker concurrency and exponential delayed retries. The mock provider distinguishes success, temporary failure, permanent failure, and flaky recovery. Attempts and final outcomes are persisted and audited.

## Real-time updates

SSE connects through the normal access-token middleware. Connections are registered under the verified organisation only. Redis Pub/Sub fans domain events across API replicas. Clients reconnect after three seconds and refetch authoritative API state because Pub/Sub is intentionally ephemeral. When Redis is unavailable, normal API writes continue but cross-instance live delivery is degraded.

## File security and storage limits

The backend limits multipart size, allowlists MIME types, verifies magic bytes, generates random storage keys, enforces tenant/assignment access, and atomically reserves organisation quota. Production should use private object storage with staged upload finalisation and short-lived authorised download URLs.

## Security considerations

Tenant IDs and roles from client input are never authority. Composite foreign keys prevent cross-tenant relations. Dynamic SQL identifiers are fixed server allowlists. Password hashes use Argon2id; refresh tokens are random, hashed, rotating, HttpOnly, and SameSite. JWT algorithm/issuer/audience/expiry are fixed and security changes revoke tokens. Upload types, signatures, sizes, paths, authorisation, and quota are checked. CSV formula injection is neutralised. Rate limits protect login and event submission. Error output avoids internal paths and stack traces.

## Production deployment and operations

Run stateless API replicas and independent worker replicas. PostgreSQL remains invariant authority, Redis coordinates BullMQ and Pub/Sub, and object storage replaces local uploads. Monitor HTTP latency/errors, DB locks/pools, Redis health, queue depth/stalls/failures, outbox age, provider results, SSE connections, and quota. Use encrypted PostgreSQL full backups plus WAL point-in-time recovery and regularly rehearse restore. See `docs/QUEUE_AND_OPERATIONS.md`.

## Assumptions and trade-offs

Redis is used for asynchronous and ephemeral concerns, while PostgreSQL constraints/transactions protect durable correctness. `DELETE /work-orders/:id` performs cancellation to preserve audit history. SSE is ephemeral and clients refetch after reconnect. Local file storage is appropriate only for assessment operation. Access tokens are short lived and refresh sessions are server-revocable.

## Known limitations or incomplete requirements

Local uploads need object-storage replacement for multi-instance production. SSE delivery is ephemeral, so the fetch-based client refetches authoritative data after reconnection. PostgreSQL/Redis integration tests require external test services and were not executed in the current environment; fast backend/frontend tests, lint, and production builds were executed locally.
