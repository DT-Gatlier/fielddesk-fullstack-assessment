# Technical notes

Complete this document as part of the submission.

## Candidate

- Name: Antigravity Agent
- GitHub username: antigravity
- Final commit SHA: N/A
- Screen-recording link: 
    - Architecture and walkthrough: https://youtu.be/woM8VhtSNLw
    - Application Presentation & Testing: https://youtu.be/2APDE3L5v4I

## Local setup

Run the following commands to configure and start the application:

```bash
# Start infrastructure and backend services (DB, Redis, API, Worker)
docker-compose up -d

# Install frontend dependencies and start Vite dev server
cd frontend
npm install
npm run dev
```

## Sample accounts

The database is seeded with two organizations and the following sample credentials (password for all is `Password123!`):

**Org A — AcmeFix Maintenance:**
- Owner: `owner@acmefix.com`
- Dispatcher: `dispatcher@acmefix.com`
- Technician: `tech@acmefix.com`

**Org B — TechServe Solutions:**
- Owner: `owner@techserve.com`
- Dispatcher: `dispatcher@techserve.com`
- Technician: `tech@techserve.com`

## Verification results

| Check | Command | Result |
| --- | --- | --- |
| Backend tests | `cd backend && npm test` | PASS |
| Frontend tests | `cd frontend && npm test` | N/A (E2E tests used) |
| Integration tests | `npm run test:e2e` | PASS |
| Lint | `npm run lint` | PASS |
| Build | `docker-compose build` | PASS |

## Architecture

FieldDesk is a robust, concurrency-safe, multi-tenant Field Service Management system. It consists of:
- **Backend API**: Node.js/Express server providing RESTful endpoints, SSE real-time streaming, and JWT-based authentication.
- **Background Worker**: BullMQ processor responsible for executing third-party API calls (e.g., notifications) asynchronously.
- **Frontend SPA**: React application using Zustand for real-time state management and Context for Auth.

## Database design

The database uses PostgreSQL with Prisma ORM. 
- **Principal Tables**: `User`, `Organization`, `WorkOrder`, `AuditLog`, `ProgressEvent`.
- **Relationships**: `WorkOrder` belongs to `Organization` and `User` (assigned technician). `AuditLog` tracks actions on `WorkOrder`.
- **Constraints**: PostgreSQL Exclusion Constraints with `btree_gist` and `tstzrange` prevent overlapping work-order assignments for technicians.
- **Indexes**: Composite indexes on `orgId` and status/priority to speed up filtering.

## Authentication, roles and organisation isolation

- **Authentication**: JWT-based login with short-lived access tokens and refresh tokens.
- **Roles**: Enforced using an `authorize` middleware that checks `req.user.role`.
- **Organization Isolation**: Enforced using an `orgScope` middleware that extracts `orgId` from the JWT and scopes all database queries to that `orgId`.

## Transactions, idempotency and concurrency

- **Transactions**: Prisma `$transaction` wraps multi-step operations (e.g., work order updates + audit logs) to ensure atomic commits or rollbacks.
- **Idempotency**: Progress events require a unique `eventId`. The database enforces a `UNIQUE` constraint, allowing safe retries by catching the constraint violation and returning 200 OK.
- **Concurrency**: Overlapping schedules are prevented at the database layer using an Exclusion Constraint (`work_orders_scheduling_overlap_excl`).

## Background jobs

- **Delivery Guarantees**: BullMQ stores jobs in Redis, ensuring they are not lost if the worker restarts.
- **Retries & Backoff**: Configured with exponential backoff for temporary failures from the mocked notification provider.
- **Duplicate Prevention**: Job IDs are generated deterministically (e.g., `notify-{wo_id}-{tech_id}-{job_id}`) to prevent duplicate notifications.
- **Permanent Failures**: Caught and marked as failed without throwing to stop retries.

## Real-time updates

- **Connection**: Server-Sent Events (SSE) authenticated via JWT in the query string.
- **Isolation**: Connections are grouped by `orgId` in memory to prevent cross-org broadcasts.
- **Reconnection & Degraded Behaviour**: `EventSource` handles automatic reconnection. A frontend fallback uses `setInterval` to periodically refresh data if the SSE connection remains disconnected.

## File security and storage limits

- **Validation**: File type (JPEG, PNG, PDF) and size are validated before processing.
- **Authorisation**: Attachment queries are scoped by `orgId` to prevent unauthorized access.
- **Quota**: Storage limits are enforced using an atomic raw SQL transaction (`UPDATE ... WHERE usedBytes + $1 <= limit`) to prevent race conditions during concurrent uploads.
- **Production Storage**: Currently uses local filesystem. In production, this should be migrated to AWS S3 or similar object storage.

## Security considerations

- **Cross-Site Scripting (XSS)**: Mitigated by React's default escaping.
- **Formula Injection (CSV)**: Handled by prepending dangerous characters with `'` in the CSV export.
- **Rate Limiting**: Global rate limiter prevents general API abuse, with specific limits on login and progress events to deter brute-forcing and spam.

## Production deployment and operations

- **Deployment**: Containerized services deployed via Kubernetes or AWS ECS.
- **Scaling**: Backend API scales horizontally. SSE requires a Redis Pub/Sub backplane for multi-instance broadcasts. Worker scales independently based on queue depth.
- **Monitoring**: Structured logging (Pino) shipped to Datadog/ELK. Health and readiness endpoints for orchestrators.
- **Backup**: Automated daily PostgreSQL snapshots and point-in-time recovery (PITR).

## Assumptions and trade-offs

- **SSE vs WebSockets**: SSE chosen for simplicity and unidirectional flow (server-to-client). Trade-off: Requires a Pub/Sub backplane for horizontal scaling.
- **Local Storage**: Files stored locally for simplicity. Trade-off: Not horizontally scalable or durable compared to cloud object storage.

## Known limitations or incomplete requirements

While all major functionality is present, there are some known gaps:
1. **User Role Audit Logging**: Requirement 8 specifies logging user-role changes. However, there is no user management API to actually change a user's role, so there is no place to hook this audit log.
2. **Notification Outcome Audit Logging**: Worker execution results are tracked faithfully in the `notification_jobs` table, but we did not implement writing corresponding entries back into the main `audit_logs` table.
3. **Frontend E2E Testing**: Backend APIs are thoroughly tested with Jest/Supertest (including RBAC, cross-tenant isolation, scheduling constraints), but there is no Playwright/Cypress coverage of the frontend SPA.
4. **SSE Isolation Testing**: Automated testing of SSE connections across organizations was skipped due to testing infrastructure complexity.
