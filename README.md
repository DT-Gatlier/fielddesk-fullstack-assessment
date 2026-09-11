# FieldDesk Full-Stack Engineering Assessment

This practical assessment is conducted by **Gatlier** to evaluate full-stack engineering ability, with particular emphasis on backend correctness, security, database design, testing and production awareness.

FieldDesk is a fictional field-service application created solely for this assessment. Candidates are expected to build a working application, explain their technical decisions and take ownership of everything they submit.

## Start here

1. Read the complete [assessment brief](docs/ASSESSMENT.md).
2. Review the [evaluation criteria](docs/EVALUATION.md).
3. Follow the [submission instructions](docs/SUBMISSION.md).
4. Complete the [technical notes](candidate-submission/TECHNICAL_NOTES.md) and [AI usage disclosure](candidate-submission/AI_USAGE.md).
5. Raise questions or blockers through a GitHub Issue in this repository.

## Local development

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for running services outside Docker)

### Quick start (Docker)

```bash
cp .env.example .env
npm run dev
```

Services:

| Service | URL |
| --- | --- |
| Frontend | http://localhost:3000 |
| API | http://localhost:3001 |
| API health | http://localhost:3001/health |
| API readiness | http://localhost:3001/ready |

Stop the stack:

```bash
npm run dev:down
```

### Local development (without Docker for app processes)

Start infrastructure only:

```bash
docker compose up postgres redis -d
cp .env.example .env
npm install --prefix backend
npm install --prefix worker
npm install --prefix frontend
npm run migrate
npm run seed
npm run backend:dev   # terminal 1
npm run worker:dev    # terminal 2
npm run frontend:dev  # terminal 3
```

### Database

```bash
npm run migrate   # apply SQL migrations
npm run seed      # seed 2 orgs × 3 roles (idempotent)
```

Sample credentials (assessment only): password `FieldDesk2026!` — see [DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md).

### Tests

Requires Postgres (and seeded data) running:

```bash
docker compose up postgres redis -d
npm run migrate
npm run seed
npm test              # 36 backend integration tests
npm run typecheck     # backend + frontend TypeScript
npm run build         # production build
```

### Project layout

```text
frontend/           Next.js UI
backend/            Fastify API + WebSocket
worker/             BullMQ notification worker
database/migrations SQL migrations
docs/               Architecture, checklist, test coverage
candidate-submission/ TECHNICAL_NOTES.md, AI_USAGE.md
```

### Documentation

- [Architecture decisions](docs/ARCHITECTURE_DECISIONS.md)
- [Database schema](docs/DATABASE_SCHEMA.md)
- [Scheduling concurrency](docs/SCHEDULING_CONCURRENCY.md)
- [Test coverage map](docs/TEST_COVERAGE.md)
- [Assessment checklist](docs/ASSESSMENT_CHECKLIST.md)
- [Technical notes (submission)](candidate-submission/TECHNICAL_NOTES.md)

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
