# Technical notes

Complete this document as part of the submission.

## Candidate

- Name:
- GitHub username:
- Final commit SHA:
- Screen-recording link:

## Local setup

Document the exact commands required to configure and start the application.

## Sample accounts

List the seeded organisations, roles and sample login credentials. Use assessment-only credentials.

## Verification results

| Check | Command | Result |
| --- | --- | --- |
| Backend tests |  |  |
| Frontend tests |  |  |
| Integration tests |  |  |
| Lint |  |  |
| Build |  |  |

## Architecture

Describe the major components, their responsibilities and important dependencies.

## Database design

Explain the principal tables, relationships, constraints, indexes and migration strategy.

## Authentication, roles and organisation isolation

Explain how authentication works and where organisation and role restrictions are enforced.

## Transactions, idempotency and concurrency

### Concurrent scheduling protection (Phase 4 — implemented)

Overlapping technician assignments are prevented using **two layers**:

1. **Transaction + overlap query** — `assignWorkOrderSafely()` locks the work order and conflicting rows with `FOR UPDATE`, checks `tstzrange` overlap, and returns `409 SCHEDULING_CONFLICT` before updating when a conflict is found.
2. **PostgreSQL exclusion constraint** — `work_orders_no_overlap` (migration `004`) rejects any commit that would create overlapping non-cancelled assignments for the same technician.

This is **safe with multiple API instances** because coordination lives entirely in PostgreSQL, not in application memory. Stateless API replicas share one database; concurrent assign requests serialise via row locks and the exclusion constraint. One request succeeds, the other receives `409`.

See [docs/SCHEDULING_CONCURRENCY.md](../docs/SCHEDULING_CONCURRENCY.md) for the full flow, error codes, and test commands.

### Progress event idempotency (Phase 5 — implemented)

`POST /api/v1/progress-events` accepts technician-submitted events with a client-supplied `eventId` idempotency key.

**Transaction boundary** (`submitProgressEvent()`):

1. `BEGIN`
2. Lock the assigned work order (`SELECT … FOR UPDATE` where `assigned_technician_id = current user`)
3. `INSERT INTO progress_events … ON CONFLICT (event_id) DO NOTHING RETURNING *`
4. If insert succeeded → apply side effects (e.g. status update) and write `progress_event.accepted` audit log
5. If insert skipped (duplicate) → load existing event and return the same success shape **without** re-applying side effects
6. `COMMIT` (or full `ROLLBACK` on any error)

**Idempotency mechanism:** global unique index on `progress_events.event_id`. Concurrent duplicate submissions race on insert; one wins, others read the stored row and return an identical `200` response. Audit and work-order mutations run only for the first accept.

**Rate limiting:** 60 requests/minute per user on the progress-events route.

## Background jobs

### Technician notifications (Phase 7 — implemented)

When a work order is assigned, the API enqueues a BullMQ job after the DB transaction commits:

- **Queue:** `notifications`
- **Job name:** `notify-technician`
- **Job ID:** `notify:{workOrderId}:{assignmentVersion}` (deterministic dedupe)
- **Payload:** `{ workOrderId, technicianId, organisationId, assignmentVersion, correlationId }`

The worker runs as a separate process (`worker/`) and reuses backend domain logic (`processNotificationJob`).

**Delivery guarantees:**

| Outcome | Behaviour |
| --- | --- |
| Success | `notification_deliveries.status = sent`, audit log `notification.sent` |
| Transient failure | BullMQ retries with exponential backoff (4 attempts, 5s base delay); row tracks `failed_transient` + attempt count |
| Permanent failure | `failed_permanent`, audit log, `UnrecoverableError` stops retries |
| Duplicate job / re-delivery | Unique `(work_order_id, assignment_version)` + skip when status is already `sent` |

**Mock provider:** `NOTIFICATION_MOCK_MODE` = `success` | `transient` | `permanent`.

## Real-time updates

### WebSocket feed (Phase 8 — implemented)

- **Endpoint:** `GET /api/v1/realtime` (WebSocket upgrade)
- **Auth:** JWT httpOnly cookie validated on handshake; clients join room `org:{organisationId}` only
- **Events:** `work_order.created`, `work_order.updated`, `work_order.assigned`, `work_order.status_changed`, `work_order.attachment_added`
- **Envelope:** `{ type, organisationId, payload, timestamp }`

**Reconnection:** the frontend reconnects with exponential backoff (max 30s) and **refetches** dashboard/list snapshots on reconnect to heal missed events.

**Degraded behaviour:** if WebSockets are unavailable, pages continue to work via normal REST polling on user actions; live updates are best-effort only.

## Audit history and CSV export

### Audit trail (Phase 9 — implemented)

Append-only `audit_logs` rows are written in the service layer (no UPDATE/DELETE API). Each entry records organisation, actor, action, entity target, timestamp, and before/after metadata where relevant.

| Action | Trigger |
| --- | --- |
| `work_order.created` | Create work order |
| `work_order.updated` | Patch work order fields |
| `work_order.assigned` | Assign technician (same transaction as scheduling) |
| `work_order.status_changed` | Status patch or accepted progress event |
| `work_order.attachment_added` | Attachment upload |
| `progress_event.accepted` | Idempotent progress event insert |
| `notification.sent` / `notification.failed_*` | Worker delivery outcome |

User-role changes are not audited because the assessment API does not expose role mutation endpoints.

### CSV export (Phase 9 — implemented)

- **Endpoint:** `GET /api/v1/exports/work-orders.csv`
- **Auth:** same rules as the work-order list (owners/dispatchers see all org orders; technicians see assigned orders only)
- **Filters:** `search`, `status`, `priority`, `sortBy`, `sortOrder` (mirrors list API)
- **Streaming:** PostgreSQL server-side cursor fetches 100 rows at a time — the full result set is never loaded into memory
- **CSV injection:** cell values starting with `=`, `+`, `-`, `@`, tab, or carriage return are prefixed with `'`
- **Frontend:** work-order list exposes an Export CSV action using the same active filters

## Frontend workflows (Phase 10)

The Next.js app covers login, dashboard, filtered/paginated work-order list, create/edit forms, detail with assignment/scheduling, attachment upload/download, activity history, and role-aware navigation (technicians see assigned work only; create/assign controls hidden).

**Responsive layout:** mobile breakpoints collapse filters, list rows, and page headers (`globals.css` `@media max-width: 640px`).

**Critical workflow test:** `backend/tests/critical-workflow.test.ts` exercises login → create work order → assign technician → technician status update → verify detail and audit trail.

## File security and storage limits

### Local storage (Phase 6 — implemented)

Attachments are stored on disk under `ATTACHMENTS_DIR` (default `./data/attachments`, Docker volume `/data/attachments`). Metadata lives in `work_order_attachments`; `organisations.storage_used_bytes` tracks quota usage.

**Upload flow** (`POST /api/v1/work-orders/:id/attachments`):

1. Owner/dispatcher only; work order must belong to the JWT organisation.
2. Magic-byte validation for JPEG, PNG, and PDF (MIME allowlist + content sniffing).
3. Max file size enforced via `MAX_ATTACHMENT_BYTES` (default 10 MB).
4. Transaction: lock organisation row → check `storage_used_bytes + size <= storage_limit_bytes` → insert attachment row → increment usage → audit log → commit.
5. Write binary to `{organisationId}/{uuid}.{ext}` — original filename is display metadata only.

**Download** (`GET /api/v1/attachments/:id/download`): authenticated stream after org + work-order access check. Storage keys and filesystem paths are never returned by the API.

**Production object-storage migration:** replace the local `writeFile` / `createReadStream` adapter with an S3-compatible backend. Keep the same DB metadata and quota logic; store the object key in `storage_key`. Upload via server-side PutObject or pre-signed PUT; download via pre-signed GET or authenticated proxy. Org quota remains derived from DB metadata (or periodic inventory sync).

## Security considerations

Describe relevant threats considered and the protections implemented.

## Production deployment and operations

Explain how you would deploy, scale, monitor, back up and recover the application.

## Assumptions and trade-offs

List significant assumptions and explain important trade-offs.

## Known limitations or incomplete requirements

List anything incomplete or not working. If none, state that explicitly.
