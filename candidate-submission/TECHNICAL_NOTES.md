# FieldDesk Technical Notes

## 1. Overview

FieldDesk is implemented as a multi-tenant field-service management application.

The repository contains:

- `frontend/` - Next.js frontend
- `backend/` - Express + TypeScript API
- `worker/` - background notification worker
- `database/` - database-related resources
- `candidate-submission/` - assessment documentation
- `tests/` - shared test resources

The backend is responsible for authentication, authorization, tenant isolation,
work-order management, progress events, attachments, audit logs and API
validation.

The worker runs independently from the API and processes notification jobs.

---

## 2. Architecture

### Frontend

The frontend is implemented using Next.js and TypeScript.

The frontend communicates with the backend API for persisted application data.

### Backend

The backend uses:

- Node.js
- TypeScript
- Express
- Prisma
- PostgreSQL
- JWT authentication
- Zod validation
- Pino structured logging
- Helmet
- CORS
- Express rate limiting

Backend modules are separated by responsibility:

- `auth`
- `work-orders`
- `progress-events`
- `attachments`
- `notifications`
- `audit-logs`

### Worker

The notification worker runs separately from the API.

It reads pending notification jobs from PostgreSQL and processes them using
a mock notification provider.

---

## 3. Authentication and Authorization

Authentication uses JWT access tokens.

Passwords are stored as bcrypt hashes rather than plaintext passwords.

The authenticated identity determines:

- user ID
- organisation ID
- role

The organisation ID is never trusted from the client when determining tenant
scope.

Role authorization is enforced through backend middleware.

Roles:

- OWNER
- DISPATCHER
- TECHNICIAN

The frontend is not treated as a security boundary.

---

## 4. Tenant Isolation

All tenant-owned resources contain an `organisationId`.

Authenticated requests derive the organisation from `req.user.organisationId`.

Database queries use the authenticated organisation when accessing:

- users
- work orders
- attachments
- progress events
- audit logs
- notification jobs

This prevents a user from accessing another organisation's resources by
manually changing an ID in a URL or request body.

Composite organisation/resource constraints are also used in the Prisma schema
to strengthen tenant isolation at the database layer.

---

## 5. Work Orders

Work orders support:

- creation
- updating
- assignment
- status
- priority
- scheduling
- search
- filtering
- sorting
- pagination
- activity history

Only authorized roles can create or update work orders.

Technician assignment is validated against the authenticated organisation.

---

## 6. Scheduling Concurrency

Technician scheduling must prevent overlapping assignments.

The implementation validates scheduling windows and uses database-level
constraints/transaction boundaries rather than relying on a frontend-only
availability check.

An automated concurrency test is included to verify that simultaneous
conflicting scheduling attempts cannot both succeed.

The important property is that correctness is maintained at the database/API
level and does not depend on an in-memory lock, so multiple API instances can
still enforce the same rule.

---

## 7. Progress Events

Progress events are authenticated and organisation-scoped.

The request body is validated before processing.

Events contain:

- event ID
- event type
- occurrence timestamp
- payload

`eventId` is used as the idempotency key.

Duplicate event submissions are prevented through the database uniqueness
constraint.

The event processing uses a transaction boundary so that the event and the
associated work-order change are not partially committed.

---

## 8. Attachments

Attachments are accepted through the backend.

The backend validates:

- MIME type
- file size
- organisation quota

Original filenames are not used as storage identifiers.

Generated storage identifiers are used instead.

Attachment access is organisation-scoped and work-order-scoped.

The API does not expose internal filesystem paths.

For production, the local storage implementation could be replaced with an
object-storage service such as S3 while retaining the same storage abstraction.

---

## 9. Background Notification Processing

When a technician is assigned to a work order, a notification job is created.

The worker:

1. Finds pending jobs.
2. Processes the notification.
3. Records attempts.
4. Retries temporary failures.
5. Uses backoff between retries.
6. Stops retrying permanent failures.
7. Records the final outcome.

The notification job has a deduplication key so the same logical notification
does not produce duplicate delivery.

A mock provider is used because no external provider account is required for
the assessment.

---

## 10. Audit Logging

Relevant actions are recorded in audit logs.

Audit records contain information such as:

- organisation
- actor
- action
- target
- timestamp
- before state
- after state

Audit history is not exposed as an editable resource through the normal API.

---

## 11. API Error Handling

The API uses centralized error handling.

Validation failures use a consistent structure such as:

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "details": {}
  }
}

Authentication, authorization, not-found and unexpected errors have separate
error codes.

Unexpected server errors are logged without exposing internal implementation
details to clients.

---

## 12. Observability

The API includes:

- request correlation IDs
- structured HTTP logging
- centralized error logging
- health endpoint
- rate limiting

Request IDs allow a request to be followed through server logs.

---

## 13. Database

PostgreSQL is used as the persistent database.

Prisma is used as the ORM.

Database migrations are stored under:

`backend/prisma/migrations`

Seed data creates two independent organisations and users for:

- Owner
- Dispatcher
- Technician

---

## 14. Testing

The backend currently includes automated tests covering:

- authentication
- invalid authentication
- tenant isolation
- cross-organisation work-order/user relationships
- health endpoint
- scheduling concurrency

Tests use PostgreSQL where database behaviour is important.

Run:

```bash
npm test