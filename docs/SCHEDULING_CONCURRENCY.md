# Scheduling concurrency — design and multi-instance safety

This document explains how FieldDesk prevents overlapping technician assignments and why the approach remains correct when more than one API process is running.

**Implementation:** `backend/src/services/scheduling.service.ts`, migration `004_scheduling_exclusion_constraint.sql`  
**Tests:** `backend/tests/scheduling.test.ts`

---

## Requirement

A technician must not be assigned to two work orders whose scheduled windows overlap. The rule must hold even when two dispatchers submit conflicting assignments at approximately the same time, and when multiple API instances handle those requests.

---

## Defence in depth (two layers)

| Layer | Mechanism | Purpose |
| --- | --- | --- |
| 1. Application | Transaction + `SELECT … FOR UPDATE` overlap query | Detect conflicts early; return a clear `409` before attempting the update |
| 2. Database | PostgreSQL **exclusion constraint** on `(assigned_technician_id, time range)` | Guarantee correctness if two transactions race past the application check |

Neither layer alone is sufficient for the assessment:

- **Application-only checks** (including in-memory locks) fail across multiple API instances because each process has separate memory.
- **Constraint-only** without a transaction would still allow races but would eventually reject one writer — the application layer provides clearer errors and audit behaviour.

Together they satisfy the brief: meaningful conflict response **and** correctness under concurrency.

---

## Assignment transaction flow

`POST /api/v1/work-orders/:id/assign` delegates to `assignWorkOrderSafely()`:

1. **`BEGIN`** — open a database transaction on a dedicated connection.
2. **Lock target work order** — `SELECT … FOR UPDATE` on the work order row being assigned.
3. **Check for overlaps** — query other non-cancelled work orders for the same technician where `tstzrange(scheduled_start, scheduled_end)` overlaps the proposed window, with **`FOR UPDATE`** on matching rows.
4. If overlap exists → **`ROLLBACK`**, respond with:
   ```json
   {
     "error": {
       "code": "SCHEDULING_CONFLICT",
       "message": "Technician already has an overlapping assignment during this window"
     }
   }
   ```
5. **Update** the work order (technician, schedule, status → `scheduled`, increment `assignment_version`).
6. **Insert audit log** in the same transaction.
7. **`COMMIT`**.

If PostgreSQL raises exclusion violation (`SQLSTATE 23P01`) — for example, two requests passed the overlap query before either committed — the transaction is rolled back and mapped to the same `409 SCHEDULING_CONFLICT` response.

---

## Database constraint

Migration `004_scheduling_exclusion_constraint.sql`:

- Enables `btree_gist`.
- Adds exclusion constraint `work_orders_no_overlap`:

```sql
EXCLUDE USING gist (
  assigned_technician_id WITH =,
  tstzrange(scheduled_start, scheduled_end, '[)') WITH &&
)
WHERE (
  assigned_technician_id IS NOT NULL
  AND status NOT IN ('cancelled')
  AND scheduled_start IS NOT NULL
  AND scheduled_end IS NOT NULL
);
```

Cancelled work orders are excluded from the constraint predicate so cancelled jobs do not block future scheduling.

---

## Why this is safe with multiple API instances

FieldDesk API processes are **stateless**. No scheduling state is stored in Node.js memory, Redis, or a local mutex.

When two API instances handle conflicting assign requests concurrently:

1. Both may reach the overlap query at nearly the same time.
2. PostgreSQL serialises the transactions via **row-level locks** (`FOR UPDATE`) and, if both attempt to commit overlapping ranges, the **exclusion constraint** rejects one transaction.
3. The losing transaction receives `23P01`, which the API converts to **`409 SCHEDULING_CONFLICT`**.
4. Exactly **one** assignment succeeds — verified by `backend/tests/scheduling.test.ts`.

This works because **PostgreSQL is the single source of truth** and all instances connect to the same database. Adding more API replicas does not introduce new scheduling races as long as they share the same Postgres cluster.

What would **not** be safe:

- In-memory locks per Node process
- Frontend-only availability checks
- Read-then-write without transaction or constraint

---

## API response

| Status | Code | When |
| --- | --- | --- |
| `200` | — | Assignment succeeded |
| `400` | `VALIDATION_ERROR` | Invalid window (`start >= end`) or invalid technician |
| `409` | `SCHEDULING_CONFLICT` | Overlapping assignment detected (application or constraint) |
| `404` | `NOT_FOUND` | Work order not in caller's organisation |

The frontend displays a specific message when `error.code === "SCHEDULING_CONFLICT"`.

---

## Verification

```bash
docker compose up postgres redis -d
npm run migrate
npm test -- --run tests/scheduling.test.ts
```

Tests cover:

1. **Concurrent assigns** — two parallel requests for the same technician and overlapping window → statuses `200` and `409`.
2. **Sequential overlap** — second overlapping assign after first succeeds → `409`.

---

## Related documentation

- [ARCHITECTURE_DECISIONS.md §8](./ARCHITECTURE_DECISIONS.md) — high-level scheduling decisions
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) — `work_orders` table and exclusion constraint notes
