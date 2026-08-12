# FieldDesk Full-Stack Engineering Assessment

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

## Backend implementation

The backend is implemented with Node.js, Express, strict TypeScript, PostgreSQL, Redis, and BullMQ. It includes tenant-safe administration and work orders, secure authentication, a configuration-driven CRUD/select router, idempotent progress events, attachments and quotas, notification processing, caching, SSE, audit history, and streaming CSV export.

See [API reference](docs/API.md), [frontend integration](docs/FRONTEND_INTEGRATION.md), [backend architecture](docs/BACKEND.md), [database design](docs/DATABASE.md), and [queue/operations](docs/QUEUE_AND_OPERATIONS.md).

### Local setup

```bash
cp .env.example .env
npm install
docker compose up -d postgres redis
npm run db:migrate
npm run db:seed
npm run dev                    # terminal 1: API
npm run worker:dev -w backend  # terminal 2: worker
npm run frontend:dev           # terminal 3: frontend at http://localhost:5173
```

The API listens on `http://localhost:8000`. If PostgreSQL and Redis already run locally, Docker is not required; `docker-compose.yml` is only a convenient infrastructure option.

The frontend runs at `http://localhost:5173` and includes lazy-loaded, role-aware workflows for the dashboard, work orders, attachments, technician progress, notifications, team management, and organisation settings. See [frontend architecture](docs/FRONTEND.md).

### Sample accounts

All seeded accounts use password `FieldDesk123!`.

| Organisation slug | Owner | Dispatcher | Technician |
| --- | --- | --- | --- |
| `northwind` | `owner@northwind.test` | `dispatcher@northwind.test` | `technician@northwind.test` |
| `contoso` | `owner@contoso.test` | `dispatcher@contoso.test` | `technician@contoso.test` |

Example login:

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"organisation":"northwind","email":"owner@northwind.test","password":"FieldDesk123!"}'
```

### Verification

```bash
npm run build
npm run lint
npm test
```

The fast suite runs without infrastructure. PostgreSQL-backed concurrency tests require a migrated test database supplied through `TEST_DATABASE_URL`.

```bash
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm test
```
