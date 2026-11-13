# FieldDesk - Multi-Tenant Field-Service Dispatch Platform

FieldDesk is a production-grade, multi-tenant field-service dispatch and operational workspace built for maintenance organisations to schedule, assign, and track field-service work with end-to-end data isolation, concurrency safety, real-time updates, and background job processing.

Developed as a submission for the **Gatlier Full-Stack Engineering Assessment** by **Abrar Aboobacker** (`abrar-aboobacker-dev`).

---

## Candidate & Submission Details

- **Candidate Name**: Abrar Aboobacker
- **GitHub Username**: `abrar-aboobacker-dev`
- **Final Commit SHA**: `7e78d9f`
- **Screen Recording**: [To be provided in PR description]
- **Detailed Technical Notes**: [candidate-submission/TECHNICAL_NOTES.md](candidate-submission/TECHNICAL_NOTES.md)
- **AI Usage Disclosure**: [candidate-submission/AI_USAGE.md](candidate-submission/AI_USAGE.md)

---

## System Architecture

```
                    ┌─────────────────────────────────┐
                    │    React 18 + Vite Frontend     │
                    │   Tailwind CSS, shadcn/ui, SSE  │
                    └───────────────┬─────────────────┘
                                    │ REST API + SSE Stream (JWT Bearer)
                    ┌───────────────▼─────────────────┐
                    │   Express 4 + Node.js API       │
                    │  (backend/src/ - REST & SSE)    │
                    │  AsyncLocalStorage Correlation  │
                    └───────────────┬─────────────────┘
                                    │
                   ┌────────────────┴────────────────┐
                   ▼                                 ▼
        ┌────────────────────┐            ┌────────────────────┐
        │ PostgreSQL 16 DB   │            │     Redis 7.0      │
        │ GiST Exclusions    │            │ Fast Idempotency   │
        │ Row & Adv Locks    │            │ Sliding Rate-Limit │
        │ Audit History      │            │ BullMQ Job Broker  │
        └────────────────────┘            └─────────┬──────────┘
                                                    │ BullMQ queue
                                          ┌─────────▼──────────┐
                                          │ Standalone Worker  │
                                          │ (worker/src/)      │
                                          │ Backoff Retries    │
                                          │ Mock Notifications │
                                          └────────────────────┘
```

### Repository Structure

Strictly following the expected layout defined in [docs/ASSESSMENT.md](docs/ASSESSMENT.md):

```text
.
|-- frontend/               # React 18 + Vite + Tailwind CSS + shadcn/ui SPA
|-- backend/                # Express 4 + TypeScript REST & SSE API server
|-- worker/                 # Independent BullMQ background notification worker
|-- database/               # SQL migrations (001-004) & idempotent seeds
|   |-- migrations/
|   `-- seeds/
|-- scripts/                # Node.js runners (migrate.js, seed.js, clean-database.js)
|-- tests/                  # Automated integration, isolation & concurrency test suites
|-- candidate-submission/   # Submission documentation
|   |-- AI_USAGE.md
|   `-- TECHNICAL_NOTES.md
|-- .env.example            # Sample environment variables
|-- docker-compose.yml      # Multi-container orchestration (5 services)
`-- README.md
```

---

## Quickstart Guide

### Option A: Docker Compose (Recommended)

Start the entire platform (PostgreSQL 16, Redis 7, Backend API, Background Worker, and Frontend) in one command:

```bash
# 1. Clone & prepare environment
cp .env.example .env

# 2. Build and launch all 5 containers
docker compose up --build -d

# 3. Check container status
docker compose ps
```

Once running, access the services:
- **Frontend Web UI**: [http://localhost:3001](http://localhost:3001) (or `http://localhost:3000`)
- **Backend API**: [http://localhost:4000](http://localhost:4000)
- **Liveness Probe**: `curl http://localhost:4000/healthz`
- **Readiness Probe**: `curl http://localhost:4000/readyz`

---

### Option B: Local Development Without Docker

#### Prerequisites
- Node.js >= 20.x, npm >= 10.x
- PostgreSQL 16 running on port 5432
- Redis 7 running on port 6379

#### 1. Configure & Install Dependencies
```bash
cp .env.example .env

npm install --prefix backend
npm install --prefix worker
npm install --prefix frontend
```

#### 2. Run Database Migrations & Seed Data
```bash
npm run db:migrate    # Applies migrations 001..004 via schema_migrations tracker
npm run db:seed       # Seeds 2 organisations, 7 users, and initial work orders
```

#### 3. Start Development Services (in separate terminal tabs)
```bash
# Terminal 1: Backend Express API Server (:4000)
npm run dev:backend

# Terminal 2: Background BullMQ Notification Worker
npm run dev:worker

# Terminal 3: Frontend React Vite Application (:3001)
npm run dev:frontend
```

---

## Sample Accounts & Login Credentials

The database is seeded with two completely isolated organisations (`Apex Facilities Management` and `Summit Infrastructure Services`) across all required roles:

| Organisation | Role | Name | Email | Password | Scope & Responsibilities |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`org-apex-01`** (Apex) | Owner | Alice Owner | `owner@apex.test` | `password123` | Full admin, user & settings management |
| **`org-apex-01`** (Apex) | Dispatcher | David Dispatcher | `dispatcher@apex.test` | `password123` | Creates, schedules, assigns work orders & exports CSV |
| **`org-apex-01`** (Apex) | Technician | Tom Technician | `technician@apex.test` | `password123` | Views assigned work orders & submits progress events |
| **`org-apex-01`** (Apex) | Technician | Tina Technician | `technician2@apex.test` | `password123` | Secondary technician for scheduling tests |
| **`org-summit-02`** (Summit) | Owner | Sam Owner | `owner@summit.test` | `password123` | Summit admin (completely isolated from Apex) |
| **`org-summit-02`** (Summit) | Dispatcher | Diana Dispatcher | `dispatcher@summit.test` | `password123` | Summit dispatcher |
| **`org-summit-02`** (Summit) | Technician | Terry Technician | `technician@summit.test` | `password123` | Summit technician |

---

## Automated Test Verification

Execute the complete test suite across unit, isolation, concurrency, worker, and frontend workflows:

```bash
# Run ALL 128 tests across 15 suites (Backend + Worker + Frontend)
npm run test:all

# Run specific test suites
npm run test:unit         # Unit tests & transaction rollback (15 tests)
npm run test:isolation    # Tenant isolation, RBAC, quotas, SSE, audit, CSV (91 tests)
npm run test:concurrency  # Concurrent scheduling race conditions & event idempotency (16 tests)
npm run test:worker       # BullMQ worker mock notification provider unit tests (3 tests)
npm run test:frontend     # React Testing Library critical scheduling workflow tests (3 tests)

# Build production bundles
npm run build             # Verifies TypeScript compilation across backend, worker, frontend
```

### Verification Results Summary

| Test Suite | Command | Passing Tests | Pass Rate |
| :--- | :--- | :--- | :--- |
| **Feature 01: Auth & Tenant Isolation** | `npm run test:isolation` | 15 / 15 | 100% |
| **Feature 02: Work Orders & Dashboard** | `npm run test:isolation` | 15 / 15 | 100% |
| **Feature 03: Scheduling Concurrency Engine** | `npm run test:concurrency` | 8 / 8 | 100% |
| **Feature 04: Progress Events & Idempotency** | `npm run test:concurrency` | 8 / 8 | 100% |
| **Feature 05: Attachments & Storage Quotas** | `npm run test:isolation` | 14 / 14 | 100% |
| **Feature 06: Background Worker & Retries** | `npm run test:isolation` + `npm run test:worker` | 11 / 11 | 100% |
| **Feature 07: Real-Time SSE Updates** | `npm run test:isolation` | 6 / 6 | 100% |
| **Feature 08: Immutable Audit History** | `npm run test:isolation` | 11 / 11 | 100% |
| **Feature 09: Reporting & Secure CSV Export** | `npm run test:isolation` | 9 / 9 | 100% |
| **Feature 10: Operational Quality & Rate Limits** | `npm run test:isolation` | 10 / 10 | 100% |
| **Feature 10: RBAC Matrix & Validation Unit** | `npm run test:unit` | 18 / 18 | 100% |
| **Frontend Critical Scheduling Workflow** | `npm run test:frontend` | 3 / 3 | 100% |
| **Total Test Suite** | `npm run test:all` | **128 / 128** | **100%** |

---

## Core Engineering Highlights

- **Zero-Trust Multi-Tenancy**: The frontend is never treated as a security boundary. All API routes derive tenant scope exclusively from cryptographically verified JWT claims (`req.tenantContext.organisationId`). Cross-tenant access attempts return `HTTP 404 Not Found` (anti-enumeration).
- **PostgreSQL GiST Concurrency Engine**: Overlapping technician assignments are prevented using PostgreSQL `btree_gist` exclusion constraints (`no_overlapping_technician_schedules`) and advisory locks, guaranteeing correctness under high-concurrency race conditions across multiple API instances.
- **Dual-Store Idempotency**: Fast-path deduplication in Redis (`SETNX`) coupled with durable PostgreSQL unique constraints (`ON CONFLICT (organisation_id, event_id) DO NOTHING`) guarantees exactly-once progress event processing and atomic rollback on failure.
- **Independent Background Worker**: BullMQ worker running in an isolated container/process with exponential backoff retries (2s, 4s, 8s, 16s...), permanent failure detection (`UnrecoverableError`), and diagnostic audit logging.
- **Tenant-Isolated Real-Time Updates**: Server-Sent Events (SSE) with 25-second heartbeat pings, per-organisation channel isolation, and automated client reconnection with exponential backoff.
- **Enterprise File Security**: Binary magic-byte inspection (`FF D8 FF`, `89 50 4E 47`, `%PDF`), opaque server-generated UUID storage keys, zero path disclosure, and organization storage quota enforcement (500 MB default).
- **Production Observability**: Structured JSON logging via Pino with automated credential/token redaction, `AsyncLocalStorage` request correlation ID propagation (`X-Correlation-ID`), `/healthz` and `/readyz` probes, and Redis sliding-window rate limiters.

---

For exhaustive architecture documentation, transaction boundaries, scaling strategies, and design decisions, refer to [candidate-submission/TECHNICAL_NOTES.md](candidate-submission/TECHNICAL_NOTES.md).
