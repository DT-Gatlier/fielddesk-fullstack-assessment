# FieldDesk Full-Stack Engineering Assessment

For the complete setup, PowerShell commands, architecture, API reference, testing and troubleshooting, see the [project guide](docs/PROJECT_GUIDE.md).

## Run the application

Requires Node.js 22.12+ and PostgreSQL 16 / Redis 7, or Docker Compose.

```sh
cp .env.example .env
# Replace JWT_SECRET with a random value of at least 32 characters.
docker compose up --build -d
docker compose exec api npm run db:seed
```

Open http://localhost:4000. Compose runs the API (serving the built React app), independent worker, PostgreSQL and Redis. A one-shot prerequisite applies migrations. Seeding is explicit because it resets demo accounts and schedules. Compose uses development cookies for local HTTP; production requires HTTPS and NODE_ENV=production. On PowerShell use `Copy-Item .env.example .env`.

For host-based development:

```sh
npm ci
npm --prefix web ci
docker compose up -d postgres redis
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to port 4000. If using existing services, set their addresses in `.env`; Compose exposes PostgreSQL on 5433.

All six demo accounts use **FieldDesk123!**:

| Role | Sree Lakshmi Services | Sri Sai Facilities |
| --- | --- | --- |
| Owner | aiswarya@lakshmi.test | priya@srisai.test |
| Dispatcher | raju@lakshmi.test | arun@srisai.test |
| Technician | kamal@lakshmi.test | suresh@srisai.test |

```sh
npm test                  # Real PostgreSQL integration tests
npm run lint              # Strict API and frontend TypeScript checks
npm run build             # API compilation and frontend production build
npm start                 # Built API and frontend
npm run worker            # Independent built worker
npx playwright install chromium
npm run test:browser       # Seeded database and built app required
```

To include the real Redis queue test, set `RUN_QUEUE_TESTS=1` before `npm test` (PowerShell: `$env:RUN_QUEUE_TESTS='1'`). Use a dedicated seeded assessment database, never production. Tests create and clean uniquely named records. See [technical notes](candidate-submission/TECHNICAL_NOTES.md) for architecture, verification and remaining limitations, and [AI disclosure](candidate-submission/AI_USAGE.md).

## Reviewer walkthrough

1. Sign in as dispatcher. **Overview** shows saved summary counts; **Work orders** supports search, status/priority/technician filters, sorting and pagination.
2. Use **New work order**, or **View → Edit / assign / reschedule**. Assignment requires a valid start/end window. A conflicting reservation returns a visible conflict message.
3. Open **Schedule** and select a date to see overlapping appointments. **Reports** exports the current search and filters as CSV.
4. Open a work order for attachments, creator/timestamps, delivery status and paginated **Activity history**. The organisation-wide **Activity history** and **Notifications** pages are available to dispatchers/owners.
5. Sign out and sign in as technician. Only assigned jobs are accessible; **Add progress** submits status updates and notes.
6. Sign in as owner for **Team & settings**, user creation/roles/activation and organisation name/storage usage.

The API and frontend start even if Redis is unavailable; notifications remain pending until Redis and the independent worker start. See [requirement coverage](docs/REQUIREMENTS.md) for implementation and test evidence.

## Source layout

`api/src/server.ts` holds API validation, access policies and SSE. `api/src/notification.ts` holds transactional mock delivery; `api/src/worker.ts` runs BullMQ and drains the outbox. `web/src` contains React. `prisma/schema.prisma`, `prisma/migrations` and `prisma/seed.js` hold the model, migrations and fixtures. `tests` contains integration and browser tests. These use the brief's permitted folder naming conventions.

This practical assessment is conducted by **Gatlier** to evaluate full-stack engineering ability, with particular emphasis on backend correctness, security, database design, testing and production awareness.

FieldDesk is a fictional field-service application created solely for this assessment. Candidates are expected to build a working application, explain their technical decisions and take ownership of everything they submit.

## Start here

1. Read the complete [assessment brief](docs/ASSESSMENT.md).
2. Review the [evaluation criteria](docs/EVALUATION.md).
3. Follow the [submission instructions](docs/SUBMISSION.md).
4. Complete the [technical notes](candidate-submission/TECHNICAL_NOTES.md) and [AI usage disclosure](candidate-submission/AI_USAGE.md).
5. Raise questions or blockers through a GitHub Issue in this repository.

## Required stack

- React or Next.js with TypeScript
- Node.js with TypeScript
- PostgreSQL
- Redis with a suitable job queue
- Docker Compose

Libraries and architectural patterns are the candidate's choice. Significant decisions and trade-offs should be documented.

## What to submit

- A working frontend, API and background worker
- Database migrations and seed data
- Automated tests
- Docker-based local setup
- Clear technical documentation
- Completed submission templates
- A pull request from the candidate's fork
- A 10–15 minute screen recording
- The final commit SHA

AI-assisted development tools are permitted. Every use must be disclosed clearly, including the tools used, the files or sections affected, the purpose of the assistance and how the output was verified. The candidate remains responsible for the correctness, security and maintainability of all submitted work.

There is no prescribed visual design. A clear, usable interface is sufficient; engineering quality is the main consideration.

## Communication

Use GitHub Issues for all assessment questions, assumptions and technical blockers. This keeps clarifications visible and ensures every candidate receives consistent information.

Please do not include confidential information, credentials or code from a current or previous employer.

---

**Conducted by Gatlier**
