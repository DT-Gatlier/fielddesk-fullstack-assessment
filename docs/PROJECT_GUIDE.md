# FieldDesk project guide

This guide covers the application, local setup, commands, API and operating limits. Run commands from the repository root unless a section says otherwise. Examples use PowerShell on Windows.

## What the application does

FieldDesk manages field-service work for separate organisations. Owners manage users and organisation settings. Dispatchers create work orders, assign technicians and schedule visits. Technicians view their assigned jobs, upload attachments and submit progress updates.

The interface includes an overview, searchable work orders, a schedule, CSV reports, activity history and notification delivery records. Assignment notifications use a mock provider; they do not send real email or SMS.

## Architecture

| Part | Implementation | Responsibility |
| --- | --- | --- |
| Frontend | React, TypeScript, Vite | Forms, navigation, work-order views and live refresh |
| API | Express, TypeScript, Zod | Authentication, permissions, validation and business operations |
| Database | PostgreSQL 16, Prisma 7 with PostgreSQL adapter | Tenant data, sessions, scheduling constraints, audit and notification outbox |
| Queue | Redis 7, BullMQ | Background notification jobs and retries |
| Worker | Separate Node.js process | Scan pending notifications and run the mock provider |
| File storage | Local `uploads` directory | Private job attachments |
| Tests | Node test runner, Playwright | Database-backed integration tests and browser workflows |

In development, the browser connects to Vite at port 5173, which forwards `/api` requests to Express at port 4000. In the built application, Express serves both the frontend and API at port 4000. SSE sends update signals; the frontend then requests current data from the API.

## Repository layout

```text
api/src/
  server.ts          API routes, authentication, validation, uploads, CSV and SSE
  db.ts              Prisma client and PostgreSQL adapter
  notification.ts    Transactional mock notification processing
  queue.ts           Queue producer helper
  worker.ts          Independent worker and pending-notification scan
web/
  src/main.tsx       Application UI and work-order workflows
  src/OperationsFeed.tsx  Activity and notification views
  src/style.css      Application styles
prisma/
  schema.prisma      Prisma models and enums
  migrations/        SQL migrations, including database constraints/support tables
  seed.js            Demo organisations, accounts and jobs
scripts/dev.js       Development process launcher
tests/api.test.cjs   PostgreSQL integration tests
tests/browser/       Playwright workflows
candidate-submission/  Technical notes and AI disclosure
docs/                Assessment brief, requirements and this guide
Dockerfile           Application image
docker-compose.yml   Local application and infrastructure services
prisma.config.ts     Prisma connection and migration configuration
playwright.config.ts Browser test server configuration
```

## Requirements

- Node.js 22.12 or newer and npm for host development.
- PostgreSQL 16 and Redis 7, either installed locally or provided by Docker Compose.
- Docker with the Compose plugin for the container setup.
- Chromium installed through Playwright for browser tests.

XAMPP is not needed to serve this application. Its location under `htdocs` does not change the Node.js startup commands.

Check the installed tools:

```powershell
node --version
npm --version
docker --version
docker compose version
```

## Environment configuration

Create the local environment file once. If `.env` already exists, edit it instead of overwriting it.

```powershell
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the generated value into `JWT_SECRET` in `.env`.

| Variable | Example/default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://fielddesk:fielddesk@localhost:5433/fielddesk?schema=public` | Host connection to the Compose database |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `JWT_SECRET` | Set a random secret of at least 32 bytes | Sign login tokens; share across API instances |
| `PORT` | `4000` | Host API port |
| `NODE_ENV` | `development` | Production enables secure cookies and requires a strong secret |
| `MOCK_NOTIFICATION_MODE` | `success` | Mock delivery outcome |
| `ORG_STORAGE_LIMIT_BYTES` | `104857600` | Per-organisation attachment quota: 100 MiB by default, minimum 5 MiB |

Compose supplies its own internal database and Redis addresses: `postgres:5432` and `redis:6379`. Host processes use `localhost:5433` and `localhost:6379`. Compose currently fixes the exposed API port at 4000 and runs with development cookies for local HTTP.

## Option 1: Run everything with Docker

After creating `.env` and setting its secret:

```powershell
docker compose up --build -d
docker compose ps -a
docker compose exec api npm run db:seed
```

Open <http://localhost:4000>. If the API container is still starting, wait for it to become available before running the seed command. The `migrate` service applies migrations before the API and worker start. It is expected to exit successfully once migrations finish.

Seeding resets demo accounts and sample schedules. Run it only against a development or assessment database.

Useful operations:

```powershell
docker compose logs --tail 100 api worker migrate
docker compose logs -f api worker
docker compose restart worker
docker compose stop
docker compose start
docker compose down
```

`down` removes containers and the Compose network while retaining named volumes. PostgreSQL data, Redis AOF data and uploads live in separate named volumes. Rebuilding the image does not reset them.

## Option 2: Run Node.js locally with Docker infrastructure

```powershell
npm ci
npm --prefix web ci
docker compose up -d postgres redis
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open <http://localhost:5173>. Press Ctrl+C to stop the development launcher.

`npm run dev` starts the API, frontend and worker. It checks Redis first. If Redis is unavailable, it starts only the API and frontend. Once Redis is available, start the worker in another terminal:

```powershell
npm run dev:worker
```

To manage all three processes separately, use one terminal per command:

```powershell
npm run dev:api
```

```powershell
npm run dev:web
```

```powershell
npm run dev:worker
```

With independently installed PostgreSQL and Redis, skip the Docker command and set `.env` to their actual addresses. The database must exist and the migration user needs permission to create the required schema objects and `btree_gist` extension.

## Demo accounts and walkthrough

All demo accounts use `FieldDesk123!`. Sree Lakshmi Services has Aiswarya (owner), Raju (dispatcher) and Kamal (technician). Sri Sai Facilities has Priya (owner), Arun (dispatcher) and Suresh (technician). These are fictional demo identities.

| Role | Sree Lakshmi Services | Sri Sai Facilities |
| --- | --- | --- |
| Owner | `aiswarya@lakshmi.test` | `priya@srisai.test` |
| Dispatcher | `raju@lakshmi.test` | `arun@srisai.test` |
| Technician | `kamal@lakshmi.test` | `suresh@srisai.test` |

1. Sign in as a dispatcher and open Work orders.
2. Create a work order with a customer, reference, title and description.
3. If no customer exists, click **Add customer** in the work-order form, enter name, address and phone (email is optional), and save. The new customer is selected automatically. Edit the work order to assign a technician and a start/end time. Overlapping active assignments for the same technician return a conflict.
4. Open its details, upload a supported attachment and view its history.
5. Check Schedule, Reports and Notifications. Notification delivery requires Redis and the worker.
6. Sign in as the assigned technician and submit a note or status update.
7. Sign in as an owner to manage users and organisation settings.
8. Sign in to the other organisation to check that its data is separate.

## Command reference

### Clear business data while keeping logins

For a local development database, preview the record counts:

```powershell
node scripts/clear-business-data.cjs
```

Delete all customers, work orders, attachments, progress, audit and notification records:

```powershell
node scripts/clear-business-data.cjs --execute
```

This keeps existing users, passwords, organisations and login sessions, resets storage usage and removes files referenced by deleted attachments. It only accepts localhost database connections. It does not purge Redis queue history. Run while other users are not editing data. Afterward, owners and dispatchers can add a customer from the work-order form. Running `npm run db:seed` restores demo customers and jobs as well as resetting demo accounts.

| Command | Purpose |
| --- | --- |
| `npm ci` | Install root dependencies from the lockfile |
| `npm --prefix web ci` | Install frontend dependencies |
| `npm run dev` | Launch development processes with Redis availability detection |
| `npm run dev:api` | API with automatic restart |
| `npm run dev:web` | Vite development frontend |
| `npm run dev:worker` | Worker with automatic restart |
| `npm run db:generate` | Generate Prisma Client from the schema |
| `npm run db:migrate` | Apply committed migrations using `prisma migrate deploy` |
| `npm run db:seed` | Reset/populate demo fixtures |
| `npm run lint` | Strict API and frontend TypeScript checks; does not run ESLint |
| `npm test` | Integration tests against a real seeded PostgreSQL database |
| `npm run build` | Compile the API and build the frontend |
| `npm start` | Start the compiled API and serve the built frontend |
| `npm run worker` | Start the compiled worker |
| `npm run test:browser` | Run Playwright workflows |
| `npm --prefix web run preview` | Preview the frontend build; not a replacement for the API server |

## Build and run the compiled application

With dependencies, environment and database already prepared:

```powershell
npm run db:generate
npm run db:migrate
npm run lint
npm run build
npm start
```

In a second terminal:

```powershell
npm run worker
```

Open <http://localhost:4000>. API output is under `dist/api/src`; the frontend build is under `web/dist`. The normal local build keeps development cookie settings. A production deployment needs HTTPS, `NODE_ENV=production` and a strong injected secret.

## Database design and correctness

| Entity | Stores |
| --- | --- |
| Organisation | Tenant identity and attachment usage counter |
| User | Organisation membership, role, password hash and active state |
| Customer | Organisation-owned customer and contact details |
| Job | Work reference, customer, technician, status, priority and schedule |
| AuditLog | Actor, action, target and before/after snapshots |
| Attachment | Job ownership, file metadata and private storage key |
| ProgressEvent | Technician notes/status events and idempotency metadata |
| Notification | Assignment outbox, delivery state and attempt count |
| SQL-owned support tables | Revocable sessions, mock delivery receipts and notification attempts |

Work references are unique within an organisation. PostgreSQL exclusion constraints prevent overlapping nonterminal jobs for a technician. Schedule ranges are half-open, so one job can end exactly when the next begins. Completed and cancelled jobs release their reservation.

Job changes, audit entries and assignment outbox records commit together. Edits check the previously read `updatedAt` inside the transaction to detect competing writes. Progress processing locks the job, rechecks permissions and commits its event, status and audit together.

Migration SQL also owns support tables and constraints beyond the Prisma schema. Review future migration SQL so those objects remain intact. `db:generate` only generates the client; it does not apply migrations.

## Authentication and permissions

Passwords are hashed with bcrypt. Login creates an eight-hour JWT and a database-backed session. The API checks the session, current user status and current role. Logout deletes the session. Cookies are HttpOnly and SameSite=Lax, with Secure enabled in production.

| Action | Owner | Dispatcher | Technician |
| --- | --- | --- | --- |
| View work orders and export CSV | Organisation | Organisation | Assigned jobs |
| Create/edit/assign work orders | Yes | Yes | No |
| Upload/view attachments | Accessible jobs | Accessible jobs | Assigned jobs |
| Submit progress | No | No | Assigned jobs |
| Organisation-wide activity/notifications | Yes | Yes | No |
| Manage users and organisation settings | Yes | No | No |

Tenant and role come from the authenticated database identity. Request filters cannot expand a technician's scope. Owner demotion/deactivation is excluded. Cross-site browser mutation requests are rejected.

## API reference

All routes below use the `/api` prefix. Except health/readiness and login, requests require a valid login cookie. Permissions and tenant checks apply on the server.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/health` | Process liveness |
| GET | `/ready` | PostgreSQL readiness |
| POST | `/auth/login` | Log in with `email` and `password` |
| POST | `/auth/logout` | Revoke current session |
| GET | `/auth/me` | Current identity |
| GET | `/events` | Authenticated SSE connection |
| GET | `/dashboard` | Scoped dashboard summary |
| GET | `/users` | Accessible user listing |
| POST | `/users` | Owner creates dispatcher/technician |
| PATCH | `/users/:id` | Owner updates a user |
| GET | `/organisation` | Owner reads organisation settings |
| PATCH | `/organisation` | Owner updates organisation name |
| GET | `/customers` | Accessible customers |
| POST | `/customers` | Owner/dispatcher creates a customer in their organisation |
| GET | `/jobs` | Filtered, paginated work orders |
| POST | `/jobs` | Create a work order |
| GET | `/jobs/:id` | Work-order details |
| PUT | `/jobs/:id` | Update/assign/reschedule work order |
| GET | `/jobs/:id/history` | Paginated job history |
| POST | `/jobs/:id/events` | Technician progress event |
| POST | `/jobs/:id/attachments` | Multipart upload, field name `file` |
| GET | `/attachments/:id` | Authorized download |
| GET | `/activity` | Organisation-wide audit feed |
| GET | `/notifications` | Organisation notification records |
| GET | `/jobs.csv` | Stream a scoped CSV export |

Job statuses: `UNASSIGNED`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`. Priorities: `LOW`, `NORMAL`, `HIGH`, `URGENT`.

List/export filters include `search`, `status`, `priority`, `technicianId`, `from` and `to`. List pagination uses `page` and `pageSize` (maximum 50). Sort fields are `updatedAt`, `scheduledStart`, `createdAt`, `referenceNumber` and `title`; `direction` is `asc` or `desc`. Schedule filters use ISO UTC timestamps. CSV uses stable ID order rather than UI sorting.

### Try the API from PowerShell

Start the API first. PowerShell stores the login cookie in a web session:

```powershell
$baseUrl = 'http://localhost:4000/api'
Invoke-RestMethod "$baseUrl/health"
Invoke-RestMethod "$baseUrl/ready"

$loginBody = @{
  email = 'raju@lakshmi.test'
  password = 'FieldDesk123!'
} | ConvertTo-Json

Invoke-RestMethod "$baseUrl/auth/login" -Method Post -ContentType 'application/json' -Body $loginBody -SessionVariable fielddeskSession
Invoke-RestMethod "$baseUrl/auth/me" -WebSession $fielddeskSession
Invoke-RestMethod "$baseUrl/customers" -WebSession $fielddeskSession
Invoke-RestMethod "$baseUrl/jobs?page=1&pageSize=10&status=UNASSIGNED" -WebSession $fielddeskSession
```

Create a work order using a customer ID returned by `/customers`:

```powershell
$jobBody = @{
  referenceNumber = 'MANUAL-' + [guid]::NewGuid().ToString().Substring(0, 8)
  title = 'Inspect the air conditioner'
  description = 'Check cooling and record any required repairs.'
  customerId = '<customer-id-from-the-API>'
  priority = 'NORMAL'
} | ConvertTo-Json

Invoke-RestMethod "$baseUrl/jobs" -Method Post -ContentType 'application/json' -Body $jobBody -WebSession $fielddeskSession
Invoke-WebRequest "$baseUrl/jobs.csv" -WebSession $fielddeskSession -OutFile fielddesk-export.csv
Invoke-RestMethod "$baseUrl/auth/logout" -Method Post -WebSession $fielddeskSession
```

### Progress events

Sign in as the assigned technician before calling this endpoint. Replace the job ID with an assigned job. Use a fresh event ID for each new action and reuse the same ID and body when retrying that action.

```powershell
$technicianLogin = @{
  email = 'kamal@lakshmi.test'
  password = 'FieldDesk123!'
} | ConvertTo-Json
Invoke-RestMethod "$baseUrl/auth/login" -Method Post -ContentType 'application/json' -Body $technicianLogin -SessionVariable fielddeskSession

$jobId = '<assigned-job-id>'
$eventBody = @{
  eventId = [guid]::NewGuid().ToString()
  type = 'status_changed'
  occurredAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  payload = @{ status = 'IN_PROGRESS' }
} | ConvertTo-Json -Depth 3

Invoke-RestMethod "$baseUrl/jobs/$jobId/events" -Method Post -ContentType 'application/json' -Body $eventBody -WebSession $fielddeskSession
```

A new event returns 201. An identical retry returns 200 with `duplicate=true`; changed content under the same ID returns 409. Types are `status_changed` and `note_added`. Status events accept `IN_PROGRESS` or `COMPLETED`; note events require `payload.note` and cannot include a status. An optional `workOrderId` must match the URL. Historical timestamps are supported, and timestamps more than five minutes ahead are rejected.

Errors use `error.code`, `error.message` and `error.requestId`. Common responses include 400 for invalid input, 401 for missing/expired sessions, 403 for forbidden actions, 409 for conflicts and 429 for rate limits.

## Notification worker

Assignment creates a pending notification in PostgreSQL. The worker scans pending records every 15 seconds and adds jobs to BullMQ using the notification ID as the job ID. Jobs have four attempts with exponential backoff starting at one second.

| Mock mode | Behavior |
| --- | --- |
| `success` | Successful delivery |
| `temporary` | Retryable failure |
| `temporary-once` | First attempt fails temporarily; a later attempt can succeed |
| `permanent` | Permanent failure without further retries |

Change `MOCK_NOTIFICATION_MODE` in `.env`, then restart the host worker. For Compose, recreate the worker so it receives changed environment values:

```powershell
docker compose up -d --force-recreate worker
docker compose logs -f worker
```

The mock stores durable delivery receipts and attempt records. Queue delivery is at-least-once. A real notification provider must support idempotency keys; a local database transaction cannot guarantee exactly-once network delivery. Failed jobs need investigation before deliberate requeue.

## Attachments, CSV and live updates

Attachments support PDF, JPEG, PNG, GIF and WebP up to 5 MiB each. The backend checks MIME type and file signatures, uses UUID storage identifiers and reserves organisation quota transactionally. Downloads repeat access checks. Files are private and accessed through the API.

CSV exports use the same scope and filters as the job list, read batches of 500, escape quotes and prefix formula-leading values with an apostrophe. Streaming handles backpressure and disconnects.

SSE sends tenant-specific invalidation signals. It rechecks session/user validity on heartbeats. The frontend reconnects and refreshes, with periodic HTTP polling as a fallback. SSE and rate limits are currently local to each API process.

## Run the tests

For a localhost PostgreSQL connection with database-creation permission, this helper prepares a separate `fielddesk_assessment_test` database, seeds it and runs generation, migration, type checks, build, integration tests and browser tests on port 4011:

```powershell
node scripts/verify-local.cjs
```

Install Playwright Chromium before using this helper. The helper leaves the application's configured database unchanged. Set `RUN_QUEUE_TESTS=1` to include the Redis test when Redis is available. Without that setting, the Redis integration test is skipped. The commands below allow running each stage manually. To choose another browser-test port, set `$env:PLAYWRIGHT_TEST_PORT = '4011'` before `npm run test:browser`.

If Google Chrome is already installed, you can use it instead of downloading Playwright Chromium:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
node scripts/verify-local.cjs
Remove-Item Env:PLAYWRIGHT_CHANNEL
```

After a successful build and database preparation, rerun only browser tests with `node scripts/verify-local.cjs --browser-only`. The database must already contain demo fixtures for this option.

Use a dedicated assessment database. Integration and browser tests create and modify real records; demo seeding also resets accounts and schedules. Configure that database through `DATABASE_URL` before migrating or seeding it. A process environment variable overrides the `.env` value:

```powershell
$env:DATABASE_URL = 'postgresql://fielddesk:fielddesk@localhost:5433/fielddesk_test?schema=public'
```

The `fielddesk_test` database must already exist. For a fresh Compose PostgreSQL instance, create it once with:

```powershell
docker compose exec postgres createdb -U fielddesk fielddesk_test
```

Skip creation if that database already exists. Apply the following to whichever dedicated database you configured:

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
npm run lint
npm test
```

Include the Redis integration test when Redis is running:

```powershell
$env:RUN_QUEUE_TESTS = '1'
npm test
Remove-Item Env:RUN_QUEUE_TESTS
```

Run browser tests:

```powershell
npx playwright install chromium
npm run build
npm run test:browser
```

Playwright starts the compiled API directly at port 4000 (the same entry point as `npm start`), or reuses an existing server outside CI. If it reuses a server, ensure that server uses the same dedicated test database. Browser workflows cover sign-in/details/history, persisted creation/edit/export, customer creation, navigation, roles and mobile use.

The PostgreSQL tests cover authentication, tenancy, permissions, concurrent scheduling, duplicate progress, rollback, uploads, CSV and notification processing. The real Redis test is opt-in. See `TECHNICAL_NOTES.md` for recorded results and execution limitations; this guide does not imply a new runtime test run.

To return to the `.env` database after using a shell override:

```powershell
Remove-Item Env:DATABASE_URL
```

## Continuous integration

`.github/workflows/verify.yml` runs on pushes and pull requests. It provisions PostgreSQL and Redis, installs dependencies, generates Prisma Client, migrates and seeds its test database, checks TypeScript, builds the application and runs integration tests with the queue test enabled. It also installs Chromium, runs browser tests, validates Compose configuration and builds the Docker image.

The workflow definition is present; check the repository's Actions results for its actual execution status. Container startup is a separate check from building an image.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Database connection refused | PostgreSQL running; host port 5433 for Compose; credentials/database in `DATABASE_URL` |
| Missing tables or relations | Run `npm run db:migrate` against the database the API is using |
| Prisma Client missing or outdated | Run `npm run db:generate`, then rebuild/restart |
| Extension permission error during migration | Migration account must be allowed to create `btree_gist` |
| Demo login fails | Correct database, seed completed and demo password unchanged |
| Notifications stay pending | Redis reachable, worker running, worker and API share the same database |
| Notifications fail | Worker logs, mock mode and notification attempt records |
| Cookies fail over local HTTP | Use development mode locally; production Secure cookies require HTTPS |
| Schedule update returns 409 | Check overlapping assignments and refresh stale work-order data |
| Upload rejected | Check size, supported format, actual file signature, assignment and remaining quota |
| Browser tests cannot launch Chromium | Run `npx playwright install chromium` |
| Frontend is missing from port 4000 | Run `npm run build`; development frontend is served separately at 5173 |
| Port is already occupied | Stop the conflicting process or adjust host configuration; browser tests expect 4000 |

Health checks and container inspection:

```powershell
Invoke-RestMethod http://localhost:4000/api/health
Invoke-RestMethod http://localhost:4000/api/ready
docker compose ps -a
docker compose logs --tail 100 postgres redis migrate api worker
```

Readiness checks PostgreSQL, not Redis, because API writes can remain available while notifications are pending. The supplied Compose startup dependencies still require Redis to be healthy before initially starting API/worker containers.

## Production considerations and remaining work

- Use HTTPS, production cookie settings, injected secrets and restricted database credentials. Run migrations once before rolling out API/worker instances.
- Store uploads in private object storage for a distributed deployment. The current filesystem setup needs a shared volume, orphan cleanup and malware scanning.
- Share SSE signals and rate-limit counters across API instances. Current login/progress limits are process-local.
- Preserve SQL-owned tables and scheduling constraints in future migrations. Tenant isolation and audit immutability are API policies; database RLS and immutability triggers are not implemented.
- Integrate a real notification provider with an idempotency contract and monitor failed jobs/outbox age.
- Add password reset, MFA, invitations, owner transfer/recovery and scheduled expired-session cleanup as needed.
- Back up PostgreSQL and uploads consistently, retain Redis AOF and test restores. Set recovery targets for the deployment.
- Review load, accessibility, monitoring and operational readiness before production use.

## Related documentation

- [README and quick start](../README.md)
- [Assessment brief](ASSESSMENT.md)
- [Evaluation criteria](EVALUATION.md)
- [Submission instructions](SUBMISSION.md)
- [Requirement coverage](REQUIREMENTS.md)
- [Technical notes and recorded verification](../candidate-submission/TECHNICAL_NOTES.md)
- [AI usage disclosure](../candidate-submission/AI_USAGE.md)
