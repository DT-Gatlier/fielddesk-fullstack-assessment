# Technical notes

Complete this document as part of the submission.

## Candidate

- Name: Arshad
- GitHub username: [arshadakl](https://github.com/arshadakl)
- Final commit SHA: `a4558e68b04e42218eef54d0b76a16b7391203cf`
- Screen-recording link: [Screen Recording Demo](https://drive.google.com/file/d/1cjC2-CjY01PFFQdjLQMBfW9-3jmE9aWg/view?usp=sharing)

## Local setup

The complete application runs locally using Docker Compose, Node.js (v22), and pnpm (v10).

### Prerequisites
- Node.js >= 22.23.1
- pnpm 10.34.6
- Docker Desktop (Linux containers)

### Setup & Startup Commands

```bash
# 1. Start PostgreSQL (v17) and Redis (v7) containers
docker compose up -d --wait

# 2. Install workspace dependencies
pnpm install --frozen-lockfile

# 3. Generate and build shared database client & types
pnpm prepare:api

# 4. Apply database migrations to PostgreSQL
pnpm db:migrate:deploy

# 5. Seed organizations, roles, and sample users
pnpm db:seed

# 6. Start development servers (Next.js on :3000, NestJS API on :3001)
pnpm dev
```

For production builds:
```bash
pnpm build
pnpm start
```

## Sample accounts

All seeded accounts use password: `Demo2026`

### Clearbrook Maintenance (`clearbrook-maintenance`)
| Name | Role | Email | Password |
| :--- | :--- | :--- | :--- |
| Arjun Nair | Owner | `arjun.nair@clearbrook.org` | `Demo2026` |
| Meera Menon | Dispatcher | `meera.menon@clearbrook.org` | `Demo2026` |
| Rahul Sharma | Technician | `rahul.sharma@clearbrook.org` | `Demo2026` |
| Priya Patel | Technician | `priya.patel@clearbrook.org` | `Demo2026` |
| Kiran Rao | Technician | `kiran.rao@clearbrook.org` | `Demo2026` |

### Oakridge Property Services (`oakridge-property-services`)
| Name | Role | Email | Password |
| :--- | :--- | :--- | :--- |
| Ananya Iyer | Owner | `ananya.iyer@oakridge.org` | `Demo2026` |
| Vikram Singh | Dispatcher | `vikram.singh@oakridge.org` | `Demo2026` |
| Neha Gupta | Technician | `neha.gupta@oakridge.org` | `Demo2026` |
| Rohan Das | Technician | `rohan.das@oakridge.org` | `Demo2026` |
| Aditi Joshi | Technician | `aditi.joshi@oakridge.org` | `Demo2026` |

## Verification results

| Check | Command | Result |
| :--- | :--- | :--- |
| Backend tests | `pnpm --filter @fielddesk/api test` | Passed (11 suites, 105 tests passed, 0 failures) |
| Frontend tests | `pnpm --filter @fielddesk/web test` | Passed (15 test files, 56 tests passed, 0 failures) |
| Integration tests | `pnpm test:integration` | Passed (Database safety and multi-tenant schema isolation) |
| Lint | `pnpm lint` | Passed (0 errors, 0 warnings across all 5 workspace packages) |
| Build | `pnpm build` | Passed (Next.js 16 Turbopack & NestJS builds compiled cleanly) |

## Architecture

FieldDesk is architected as a modular TypeScript monorepo managed with Turborepo and pnpm workspaces:

- **`apps/web` (Frontend)**: Next.js 16 (App Router) with React 19, Tailwind CSS, TanStack Query for server state management, and Server-Sent Events (SSE) for real-time dashboard reactivity. Uses Radix UI primitives and custom dialogs for responsive desktop and mobile workflows.
- **`apps/api` (Backend)**: NestJS API utilizing modular domain design, class-validator DTOs, and global filters/interceptors for structured logging, correlation IDs, and unified error responses.
- **Background Worker (`apps/api/src/worker.ts`)**: Autonomous Node.js worker service that polls the PostgreSQL transactional outbox using `FOR UPDATE SKIP LOCKED`, executing external technician notification dispatches with backoff and retry management.
- **`packages/database`**: Shared Prisma ORM schema, migrations, seed runners, and database access layer ensuring strict type safety and relational guarantees across apps.
- **Data Stores**:
  - **PostgreSQL 17**: Relational multi-tenant datastore with `btree_gist` extension for exclusion constraints, row locking, and transactional outbox.
  - **Redis 7.4**: Ephemeral session storage, sliding-window rate limiting, and Pub/Sub message broker for tenant-isolated SSE streaming.

## Database design

- **Interactive Database Design Diagram**: [https://dbdiagram.io/d/Arshad-6ac87bf79068dd16e2880694](https://dbdiagram.io/d/Arshad-6ac87bf79068dd16e2880694)

### Core Schema & Relational Models
- **`Organisation`**: Top-level tenant boundary storing slug, name, and configurable `storageQuotaBytes` (default 50 MB).
- **`User`**: Tenant-scoped accounts with roles (`OWNER`, `DISPATCHER`, `TECHNICIAN`), Argon2id password hash, and `authVersion` for immediate token invalidation.
- **`Session`**: Server-tracked session records with SHA-256 token hashes, CSRF tokens, and expiry timestamps.
- **`WorkOrder`**: Work units containing reference number, priority (`LOW`, `MEDIUM`, `HIGH`, `URGENT`), status (`DRAFT`, `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`), site name, creator, assigned technician, and scheduling timestamps (`scheduledStart`, `scheduledEnd`).
- **`WorkOrderEvent`**: Immutable event log tracking technician status transitions and notes (`STATUS_CHANGED`, `NOTE_ADDED`, `WORK_STARTED`, `WORK_COMPLETED`) with unique deduplication on `[organisationId, eventId]`.
- **`Attachment`**: File metadata referencing storage key, SHA-256 content hash (for deduplication), original filename, MIME type, and byte size.
- **`NotificationOutbox`**: Transactional outbox records holding notification payloads, attempt counters, exponential backoff timestamps, and status (`PENDING`, `PROCESSING`, `DELIVERED`, `FAILED`, `DEAD_LETTER`).
- **`InAppNotification`**: User-facing notification records with read/unread flags.

### Constraints & Indexes
- **Technician Overlap Prevention**: Enforced via PostgreSQL `btree_gist` exclusion constraint:
  `EXCLUDE USING gist (assignedTechnicianId WITH =, tstzrange(scheduledStart, scheduledEnd) WITH &&) WHERE (status != 'CANCELLED')`
- **Tenant Scoping Indexes**: Composite unique constraints on `[organisationId, id]` and `[organisationId, reference]` ensure tenant isolation is enforced at the database engine level.

## Authentication, roles and organisation isolation

- **Session Handling**: Multi-tenant authentication using secure HTTP-only cookies storing opaque session IDs. The API verifies the session against PostgreSQL, extracting user ID and organisation ID.
- **Synchronizer CSRF Protection**: `CsrfGuard` mandates that all state-changing mutating requests (`POST`, `PATCH`, `DELETE`) include an `x-csrf-token` header matching the authenticated session.
- **Organisation Isolation**: The tenant boundary is strictly derived from the authenticated session context (`identity.organisation.id`). Client-supplied organisation identifiers in headers, query parameters, or request bodies are completely rejected. Every database query enforces tenant filters at the repository layer.
- **Role-Based Access Control (RBAC)**: Enforced via `@RequirePermission()` decorator:
  - **Owner**: Manages organisation settings, users, and full work order lifecycles.
  - **Dispatcher**: Creates, schedules, assigns, edits, and exports work orders.
  - **Technician**: Read-only access restricted to work orders assigned to them, with permissions to submit progress events and progress attachments.

## Transactions, idempotency and concurrency

- **Concurrent Scheduling Protection**: When a dispatcher assigns a technician with scheduled start/end times, the update occurs within a database transaction. If two dispatchers attempt overlapping assignments simultaneously across multiple API instances, the PostgreSQL exclusion constraint triggers error `23P01`, which the API maps to a clean `409 Conflict` response with an explanatory message.
- **Idempotent Progress Events**: Technicians submit client-generated `eventId` values. Unique constraint `[organisationId, eventId]` prevents duplicate writes. 
- **Idempotent Authorization Boundary**: When replaying an existing `eventId`, the service validates technician assignment against the work order *before* returning the cached record, preventing unauthorized data leakage.
- **Atomic State Transitions**: Status updates and progress events execute within Prisma `$transaction` blocks under row-level locks (`SELECT ... FOR UPDATE`), guaranteeing that invalid state transitions are aborted without partial database mutation.

## Background jobs

- **Delivery Guarantees (Transactional Outbox)**: When a work order is assigned or updated, notification records are written to `NotificationOutbox` in the same database transaction. Jobs are never lost if the external network is unreachable.
- **Independent Worker Process**: The worker runs in a separate process (`pnpm start:worker` or `worker.ts`), polling pending outbox entries using `FOR UPDATE SKIP LOCKED` to allow seamless horizontal worker scaling without duplicate processing.
- **Retries & Exponential Backoff**: Transient failures (e.g., network timeouts or simulated 500 errors) are retried with exponential backoff:
  `nextAttemptAt = now + (initialIntervalMs * 2^(attempt - 1))`
- **Permanent Failure & Dead Letter**: Permanent failures (e.g., 400 Bad Request / unroutable recipient) or jobs exhausting 3 maximum attempts are immediately transitioned to `DEAD_LETTER` with error stack traces preserved for operator inspection.
- **Mock Provider Simulation**: External delivery is handled by a configurable mock service capable of simulating success, temporary network blips, and permanent recipient errors.

## Real-time updates

- **Transport**: Real-time events stream to connected browsers via Server-Sent Events (SSE) at `GET /api/v1/realtime/stream`.
- **Connection Authentication**: The SSE endpoint requires valid session cookie authentication on handshake.
- **Organisation Isolation**: Real-time broadcasts use Redis Pub/Sub channels strictly keyed by organisation ID (`fielddesk:org:{organisationId}:events`). Subscribers only receive events published to their tenant channel.
- **Reconnection & Degraded Behaviour**: The frontend hook (`useRealtimeEvents`) includes auto-reconnect logic with exponential backoff. In the event of network disruption or Redis unavailability, the UI seamlessly relies on TanStack Query's cache invalidation on user actions and window focus to guarantee eventual consistency.

## File security and storage limits

- **File Validation**: Uploaded files undergo server-side validation checking size (maximum 10 MB) and verifying true MIME types using magic-byte inspection (`file-type` sniffing for JPEG, PNG, PDF) to prevent executable spoofing.
- **Secure File Storage**: Physical files are stored on disk using cryptographically secure UUID `storageKey` identifiers. The original user filename is stripped from the storage system to prevent path traversal.
- **Content Deduplication**: SHA-256 hashes are calculated for uploaded files. Identical files share physical disk storage while maintaining distinct, tenant-scoped logical database records.
- **Storage Quota Enforcement**: The organisation's total storage usage is verified against `storageQuotaBytes` (default 50 MB) before committing uploads.
- **Access Control & Safe Delivery**: Attachments are streamed through authenticated API routes enforcing tenant and role ownership, setting headers `X-Content-Type-Options: nosniff` and sanitized `Content-Disposition`.
- **Production Object Storage Migration**: In a production environment, local filesystem storage is replaced by AWS S3 or Cloudflare R2:
  1. The API generates short-lived, pre-signed upload URLs with strict MIME-type and Content-Length constraints.
  2. The client uploads directly to S3.
  3. S3 triggers an event webhook or the client notifies the API to verify size, hash, and metadata before committing the database record.
  4. Downloads are served via pre-signed S3 GET URLs or Cloudflare CDN with signed access tokens.

## Security considerations

- **CSV Formula Injection (Spreadsheet Injection)**: Work-order export sanitizes all text fields by prefixing potentially dangerous formula trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`) with single quotes (`'`).
- **CSRF & Session Security**: HTTP-only, SameSite cookies with strict Synchronizer CSRF tokens.
- **Authentication Rate Limiting**: Sliding-window rate limiting backed by Redis protects `/api/v1/auth/login` against brute-force password guessing.
- **SQL & Parameter Injection**: All queries use Prisma ORM parameterized queries or strictly validated SQL parameters.
- **Information Disclosure**: API responses return normalized error codes (`NOT_FOUND`, `FORBIDDEN`, `CONFLICT`) without leaking database internals or stack traces in production mode.

## Production deployment and operations

- **Containerization**: Multi-stage Dockerfiles compiling lightweight Node.js Alpine images for the API, Worker, and Next.js frontend.
- **High Availability & Autoscaling**:
  - API pods deployed as stateless services behind an AWS Application Load Balancer / Kubernetes Ingress.
  - Background workers deployed as separate worker pods scaling based on pending outbox queue depth.
- **Managed Databases**:
  - AWS Aurora PostgreSQL (Multi-AZ) with automated backups, Point-In-Time Recovery (PITR), and read replicas for heavy reporting queries.
  - AWS ElastiCache for Redis in cluster mode with automatic failover.
- **Observability**: Health checks (`/health` liveness and readiness probes), structured JSON logging with correlation IDs (`x-request-id`), and Prometheus metrics instrumentation.

## Assumptions and trade-offs

1. **Local Disk Storage vs. Object Storage**: For local assessment simplicity and self-containment, attachments are stored on the local volume rather than requiring third-party cloud S3 credentials. The architecture decouples the storage repository interface to allow drop-in S3 replacement.
2. **Server-Sent Events vs. WebSockets**: SSE was chosen over WebSockets because dashboard updates are unidirectional (server to client). SSE operates natively over HTTP/2, traverses enterprise firewalls easily, and avoids complex WebSocket connection upgrading.
3. **Transactional Outbox vs. BullMQ/RabbitMQ**: To minimize external infrastructure dependencies while ensuring guaranteed atomic delivery with work order persistence, a PostgreSQL-backed transactional outbox was chosen over an external queue broker.

## Known limitations or incomplete requirements

1. **Dynamic Column Sorting**: Work-order list queries currently default to ordering by creation timestamp (`createdAt DESC`). Dynamic client-specified sorting by priority, status, or scheduled dates on the list table was deferred.
2. **Audit History Scope**: Immutable audit event logging is implemented for technician progress updates (`WorkOrderEvent`), while user-role changes and administrative adjustments are tracked via database entity update timestamps rather than a dedicated administrative audit log table.
3. **Progress Event Specific Rate Limiting**: Rate limiting is strictly enforced on authentication endpoints; dedicated per-route rate limiting on `POST /api/v1/work-orders/:id/events` was omitted in favor of session concurrency checks.
