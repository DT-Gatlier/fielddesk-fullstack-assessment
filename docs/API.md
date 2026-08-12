# FieldDesk API reference

Base URL: `http://localhost:8000/api/v1`

JSON endpoints return `{ "data": ... }`. Paginated endpoints also return `meta: { page, limit, total }`. Timestamps are ISO-8601 UTC strings. IDs are UUIDs. Unknown request fields are rejected on write endpoints.

## Authentication

### `POST /auth/login`

Rate limited to 10 attempts per 15 minutes per client.

```json
{
  "organisation": "northwind",
  "email": "owner@northwind.test",
  "password": "FieldDesk123!"
}
```

Returns the access token and current user. It also sets the rotating `fielddesk_refresh` HttpOnly, SameSite=Strict cookie. Send the access token as `Authorization: Bearer <token>`.

### `POST /auth/refresh`

Rotates the refresh session and returns a new access token. Browser clients may send `{}` and use the HttpOnly cookie. The optional `{ "refreshToken": "..." }` body supports clients that explicitly manage a token obtained from the login `Set-Cookie` header.

### `POST /auth/logout`

Authenticated. Revokes all refresh sessions for the user and increments the user's token version, invalidating existing access tokens.

### `GET /auth/me`

Returns `id`, `name`, `email`, `role`, `organisationId`, `organisationName`, and `organisationSlug`.

## Organisation and users

| Method | Path | Roles | Request or query |
| --- | --- | --- | --- |
| GET | `/organisation` | All | Current organisation, settings, and storage usage |
| PUT | `/organisation` | Owner | Any of `name`, `timezone`, `storageLimitBytes`, `settings` |
| GET | `/users` | Owner, dispatcher | Optional `role`, `active=true\|false`, `search` |
| POST | `/users` | Owner | `name`, `email`, `password`, `role` |
| PUT | `/users/:id` | Owner | Any of `name`, `email`, `password`, `role`, `isActive` |

Changing a user's role, password, or active state invalidates that user's current access tokens. An owner cannot demote or deactivate their own account.

## Dashboard

### `GET /dashboard`

Returns `statusCounts`, `priorityCounts`, the next ten scheduled work orders, and organisation storage usage. Technician results only include their assigned work. Responses are briefly cached in Redis. All tenant mutations increment a Redis cache version, so stale cache keys cease to be used.

The response header `x-cache` is `HIT` or `MISS`.

## Work orders

### `GET /work-orders`

Query parameters:

| Name | Values/default |
| --- | --- |
| `search` | Reference, title, or site substring |
| `status` | `draft`, `scheduled`, `in_progress`, `completed`, `cancelled` |
| `priority` | `low`, `medium`, `high`, `urgent` |
| `sort` | `createdAt` (default), `scheduledStart`, `priority`, `status` |
| `direction` | `desc` (default) or `asc` |
| `page` | Positive integer, default 1 |
| `limit` | 1–100, default 20 |

Technicians only receive their assignments.

### `GET /work-orders/:id`

Returns the work order plus `history`, `attachments`, and immutable `progressEvents`. Technicians can only read assigned work orders.

### `POST /work-orders`

Owner or dispatcher. Returns `201` after the work order, audit row, and notification outbox row commit. Notification delivery occurs asynchronously.

```json
{
  "referenceNumber": "NW-1042",
  "title": "Repair rooftop unit",
  "description": "Unit is reporting a pressure alarm",
  "priority": "high",
  "status": "scheduled",
  "assignedTechnicianId": "uuid-or-null",
  "scheduledStart": "2026-08-14T09:00:00.000Z",
  "scheduledEnd": "2026-08-14T11:00:00.000Z",
  "siteName": "Warehouse 4"
}
```

`description`, `priority`, `status`, technician, and schedule have defaults. Schedule start/end must be supplied together and end must be later. An overlap returns `409` with `details.field = "schedule"`.

### `PUT /work-orders/:id`

Owner or dispatcher. Accepts any non-empty subset of the create fields. Updates, audit history, and assignment notification outbox writes are atomic.

### `DELETE /work-orders/:id`

Owner or dispatcher. This is a safe cancellation, not physical deletion. It sets status to `cancelled`, releases the exclusion-constraint time range, preserves history and attachments, and emits `work_order.cancelled`.

### `GET /technicians/availability`

Required query: `technicianId`, `start`, `end`. Optional: `excludeWorkOrderId` when editing. Returns `{ available, conflicts }`. This is a user-experience preview only; the PostgreSQL constraint is the final concurrency-safe authority.

## Progress events

### `POST /progress-events`

Assigned technician only; rate limited to 60 requests/minute.

```json
{
  "eventId": "evt-10001",
  "workOrderId": "uuid",
  "type": "status_changed",
  "occurredAt": "2026-08-12T10:30:00.000Z",
  "payload": { "status": "in_progress", "note": "Work started" }
}
```

Accepted status values are `in_progress` and `completed`. A first acceptance returns `201`; an exact replay returns `200` with `duplicate: true`. Reusing an `eventId` for different content returns `409`. The immutable event, work-order update, and audit entry are one transaction.

## Attachments

| Method | Path | Roles | Behaviour |
| --- | --- | --- | --- |
| GET | `/work-orders/:id/attachments` | Authorised readers | Metadata list; no filesystem paths |
| POST | `/work-orders/:id/attachments` | Owner, dispatcher, assigned technician | `multipart/form-data`, one `file` field |
| GET | `/work-orders/:id/attachments/:attachmentId` | Authorised readers | Authorised download stream |
| DELETE | `/work-orders/:id/attachments/:attachmentId` | Owner, dispatcher | Removes metadata/file and releases quota |

JPEG, PNG, WebP, and PDF are accepted. Default maximum is 10 MiB. MIME type and file signature are both checked. `413` means the per-file limit was exceeded; `400` with a storage-limit message means organisation quota was exceeded.

## Dynamic lookup resources

The following server-configured resources exist:

- `/employees`: GET, POST, PUT, DELETE, SELECT
- `/departments`: GET, POST, PUT, SELECT

Generated patterns:

| Method | Path | Behaviour |
| --- | --- | --- |
| GET | `/:resource` | `search`, allowlisted `sort`, `direction`, `page`, `limit` |
| GET | `/:resource/select/options` | Up to 100 `{ id, value }` entries; optional `search` |
| GET | `/:resource/:id` | One tenant-scoped record |
| POST | `/:resource` | Strict validated creation |
| PUT | `/:resource/:id` | Strict validated partial update |
| DELETE | `/:resource/:id` | Tenant-scoped deletion if enabled |

Department writes require owner. Employee create/update allows owner and dispatcher; employee deletion requires owner.

## Audit and notifications

### `GET /audit-entries`

Owner or dispatcher. Optional `targetType`, `targetId`, `action`, `page`, and `limit`. Audit entries have no update or delete endpoint.

### `GET /notifications`

Owner or dispatcher. Returns the latest 100 outbox jobs and all recorded attempts/outcomes.

### `POST /notifications/:id/retry`

Owner or dispatcher. Returns `202` after changing a permanently failed job back to pending. The outbox dispatcher submits it to BullMQ shortly afterward.

## Reporting

### `GET /reports/work-orders.csv`

Uses the same `search`, `status`, and `priority` filters and technician scope as the list API. Rows stream from a PostgreSQL cursor in batches rather than accumulating in memory. Every field is CSV-escaped and values beginning with spreadsheet formula characters are prefixed with an apostrophe.

## Real-time events

### `GET /events/stream`

Authenticated Server-Sent Events connection. Use an SSE client that supports the `Authorization` header (native browser `EventSource` does not). The connection starts with a `connected` event, sends 20-second heartbeats, and specifies a 3-second retry interval. Domain event examples:

- `work_order.created`, `work_order.updated`, `work_order.cancelled`, `work_order.progress`
- `attachment.added`, `attachment.deleted`
- `user.created`, `user.updated`, `organisation.updated`
- `notification.delivered`, `notification.temporary_failure`, `notification.permanent_failure`

Each JSON event contains `id`, `type`, `organisationId`, `occurredAt`, and `data`. Redis Pub/Sub distributes events between API instances; each connection is registered only under its verified organisation. Real-time delivery is ephemeral: after reconnecting, refetch dashboard/list/detail data as the source of truth.

## Error contract

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {}
  },
  "requestId": "c56d..."
}
```

Common statuses: `400` malformed business input, `401` missing/invalid identity, `403` role or assignment denial, `404` absent/out-of-scope record, `409` duplicate or schedule conflict, `413` upload too large, `422` structural validation/constraint failure, `429` rate limit, and `500` unexpected failure. `x-request-id` is accepted and returned for support correlation.
