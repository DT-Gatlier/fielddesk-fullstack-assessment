# Database design

FieldDesk uses PostgreSQL 16. Migrations are in `database/migrations`; the runner applies SQL files in filename order and records each filename in `schema_migrations`.

## Tenant model

`organisations` is the tenant root. Every tenant-owned table contains a non-null `organisation_id`. Queries use the organisation ID from the verified access token, never an organisation supplied in a URL, query string, or request body.

Composite foreign keys such as `(organisation_id, assigned_technician_id)` ensure that related records belong to the same organisation even if application validation is bypassed. Tenant-owned IDs also have `(organisation_id, id)` unique keys to support these references.

## Tables

| Table | Purpose | Important constraints/indexes |
| --- | --- | --- |
| `organisations` | Tenant and storage quota | Unique slug; non-negative usage and positive limit |
| `users` | Login identity and role | Unique email per organisation; role enum; token version for revocation |
| `refresh_sessions` | Rotating login sessions | Unique hashed token; expiry/revocation indexes; tenant-safe user FK |
| `departments` | Organisation department lookup | Unique code per organisation |
| `employees` | Example dynamic CRUD resource | Tenant-safe department FK; unique email per organisation |
| `work_orders` | Field work and schedule | Unique tenant reference; tenant-safe creator/technician FKs; schedule window check |
| `attachments` | File metadata only | Safe random storage key; allowed content-type check; tenant-safe work order/uploader FKs |
| `progress_events` | Immutable accepted mobile events | Unique `(organisation_id, event_id)` idempotency key |
| `audit_entries` | Append-only activity history | Indexed by tenant, target, and time; no update/delete API |
| `notification_jobs` | Transactional notification outbox | Unique deduplication key; ready-job partial index |
| `notification_attempts` | Worker attempt history | One row per job attempt |

## Scheduling concurrency

The `technician_schedule_no_overlap` GiST exclusion constraint rejects intersecting half-open ranges for the same organisation and technician. Cancelled work orders do not reserve time. A database constraint remains correct with simultaneous transactions and with multiple API instances; an application-only availability check would have a race window. PostgreSQL error `23P01` is translated to HTTP `409 CONFLICT`.

## Progress-event transaction

The event insert, work-order status update, and audit insert share one database transaction. The work order is locked with `SELECT ... FOR UPDATE`. A unique tenant/event key and `ON CONFLICT DO NOTHING` make simultaneous duplicates safe. The accepted request is stored separately and has no mutation endpoint.

## Attachment quota

Quota reservation uses one conditional update:

```sql
UPDATE organisations
SET storage_used_bytes = storage_used_bytes + $size
WHERE id = $organisation
  AND storage_used_bytes + $size <= storage_limit_bytes;
```

Concurrent uploads therefore cannot both spend the same remaining quota. Metadata, quota, and audit changes share a transaction. Local file storage is assessment-only; production should use private object storage, generated keys, server-side encryption, and short-lived authorised download URLs. A production design should also use a staged-object/finalisation job to reconcile the non-transactional object store with PostgreSQL.

## Indexing

Work-order list indexes start with `organisation_id`, followed by common status, technician/schedule, or time columns. Audit and attachment indexes follow the same tenant-first pattern. Search currently uses bounded `ILIKE` in the API; the migration includes a full-text index for a future `tsvector` query implementation.
