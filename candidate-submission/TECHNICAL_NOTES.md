# Technical notes

Complete this document as part of the submission.

## Candidate

- Name: Arjun M S
- GitHub username: arjun-ms
- Final commit SHA: (To be added before submission)
- Screen-recording link: (To be provided after recording)

## Local setup

Run the setup script which creates `.env`, starts Docker containers, and runs migrations:
- Windows: `.\setup.ps1`
- Mac/Linux: `./setup.sh`

## Sample accounts

The seed script creates a "Demo Org" with the following accounts (password is `password123` for all):
- Owner: `owner@demo.com`
- Admin: `admin@demo.com`
- Dispatcher: `dispatcher@demo.com`
- Technician: `technician@demo.com`

## Verification results

| Check | Command | Result |
| --- | --- | --- |
| Backend tests |  |  |
| Frontend tests |  |  |
| Integration tests |  |  |
| Lint |  |  |
| Build |  |  |

## Architecture

- **Backend:** FastAPI providing REST endpoints.
- **Frontend:** React with Vite.
- **Database:** PostgreSQL.
- **Background Jobs:** Celery using Redis as the message broker.
- **Real-time:** Socket.IO integrated with ASGI.

## Database design

PostgreSQL with Alembic migrations. 
**Tenant Isolation:** Enforces Row Level Security (RLS). Each request sets `app.current_organisation_id` to filter queries automatically, preventing cross-tenant leaks.

## Authentication, roles and organisation isolation

- **Auth:** JWT tokens.
- **Isolation:** JWT payload contains `org_id`. It is extracted by FastAPI dependencies and applied to the PostgreSQL RLS.
- **Roles:** Enforced in backend route dependencies (e.g. `get_dispatcher_user`).

## Transactions, idempotency and concurrency

- **Concurrency:** PostgreSQL `EXCLUDE USING gist` constraint on `scheduled_range` and `technician_id` atomically prevents overlapping assignments.
- **Idempotency:** Unique constraint on `event_id` prevents duplicate progress events. `IntegrityError` is caught and the existing event is returned safely.
- **Transactions:** SQLAlchemy handles atomic commits/rollbacks so updates and audit logs succeed or fail together.

## Background jobs

- **Provider:** Celery backed by Redis.
- **Guarantees & Duplicate prevention:** The `Notification` table tracks status (`pending`, `sent`, `failed`). The worker checks this status first, preventing duplicate delivery.
- **Retries & Backoff:** Uses exponential backoff (`2 ** attempts`) for `ProviderTemporaryError`.
- **Permanent failure:** `ProviderPermanentError` immediately marks the status as `failed` without retrying. Max retries capped at 5.

## Real-time updates

- **Authentication:** Socket.IO connections require a valid JWT token.
- **Isolation:** Clients join a Socket.IO room specific to their `org_id` (e.g. `org_{org_id}`). Events are only broadcast to that room.
- **Reconnection:** `socket.io-client` handles automatic reconnections. If real-time fails, clients fall back to REST API queries.

## File security and storage limits

- **Validation & Authorisation:** API validates limits before upload. Users can only upload if their organisation has remaining quota.
- **Quota enforcement:** `storage_used_bytes` is atomically updated in the database to prevent race conditions.
- **Production object-storage:** Local storage is used here. In production, we would use Amazon S3 with presigned URLs for secure, direct-to-cloud uploads and downloads, offloading bandwidth from the API.

## Security considerations

- **Cross-tenant access:** Prevented by Postgres Row Level Security (RLS).
- **SQL Injection:** Prevented by SQLAlchemy ORM parameterized queries.
- **XSS:** Handled by React which auto-escapes content.
- **Broken Access Control:** Roles strictly enforced on backend routes using FastAPI dependencies.

## Production deployment and operations

- **Deployment:** Containerized backend/frontend. Deploy to AWS ECS/EKS.
- **Database & Cache:** Managed services like AWS RDS (Postgres) and ElastiCache (Redis).
- **Scaling:** Stateless backend and Celery workers scale horizontally. Socket.IO requires a Redis adapter to sync rooms across instances.
- **Monitoring & Backup:** CloudWatch/DataDog for logs. RDS automated backups for disaster recovery.

## Assumptions and trade-offs

- **Redis vs RabbitMQ:** Chose Redis as the message broker for Celery. Redis is a multi-purpose, in-memory data store. Because it holds data in RAM and supports various data structures, developers use it for several roles:
  - Cache: Storing frequently accessed data to speed up read times.
  - Message Broker / Queue: Holding tasks in a line and passing messages between services (how we use it here with Celery).
  - Session Store: Keeping users logged in by storing their session tokens quickly.
  
  It is a single tool that can wear many hats depending on configuration. This makes it simpler to deploy locally and requires less infrastructure overhead than adding RabbitMQ.

- **Socket.IO vs SSE:** The assessment permitted WebSockets or Server-Sent Events (SSE). Since the dashboard only receives one-way updates, SSE would have been sufficient and lighter. We chose Socket.IO (WebSockets) because its built-in "rooms" feature made organisation isolation trivial to implement, and it handles client reconnections automatically.

## Known limitations or incomplete requirements

List anything incomplete or not working. If none, state that explicitly.
