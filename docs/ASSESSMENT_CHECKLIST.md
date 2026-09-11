# FieldDesk assessment checklist

**Purpose:** Temporary working checklist for development and submission. Update this file as tasks are completed (`[ ]` → `[x]`).

**Candidate:** suhailkc  
**Branch:** `assessment/suhailkc`  
**Started:** 2026-09-08

> This file is for your own tracking. The official submission checkboxes are in `.github/pull_request_template.md` and `candidate-submission/TECHNICAL_NOTES.md`.

---

## Progress summary

| Phase | Status | Notes |
| --- | --- | --- |
| 0. Setup & planning | ✅ Done | Stack locked; ERD in DATABASE_SCHEMA.md |
| 1. Infrastructure skeleton | ✅ Done | Docker compose verified locally |
| 2. Auth & tenant isolation | ✅ Done | Login, JWT cookies, role guards, 8 integration tests |
| 3. Work orders core | ✅ Done | CRUD, list/filter, dashboard, frontend, 7 tests |
| 4. Scheduling & concurrency | ✅ Done | Exclusion constraint, transactions, 409, tests, docs |
| 5. Progress events | ✅ Done | Idempotent POST, tests, TECHNICAL_NOTES |
| 6. Attachments & quotas | ✅ Done | Upload/download, quota, tests, frontend |
| 7. Background worker | ✅ Done | BullMQ enqueue, worker, dedupe, tests |
| 8. Real-time updates | ✅ Done | WebSocket org rooms, frontend reconnect, test |
| 9. Audit & CSV export | ✅ Done | Streaming CSV export, audit verified |
| 10. Frontend workflows | ✅ Done | Critical workflow test, CSV export UI |
| 11. Ops & API quality | ✅ Done | Correlation IDs, typecheck, graceful shutdown |
| 12. Testing | ✅ Done | 36 tests, TEST_COVERAGE.md |
| 13. Documentation & submission | 🟡 In progress | Docs complete; PR + recording pending |

Update the status column: ⬜ Not started → 🟡 In progress → ✅ Done

---

## Phase 0 — Setup & planning

- [x] Fork Gatlier repo and clone your fork
- [x] Add `upstream` remote pointing to `DT-Gatlier/fielddesk-fullstack-assessment`
- [x] Create and work on branch `assessment/suhailkc`
- [x] Read `docs/ASSESSMENT.md`, `docs/EVALUATION.md`, `docs/SUBMISSION.md`
- [x] Write architecture decisions (`docs/ARCHITECTURE_DECISIONS.md`)
- [x] Confirm stack choices (Next.js, Fastify, Drizzle, BullMQ, WebSockets) — see ARCHITECTURE_DECISIONS §3
- [x] Sketch ERD / first-pass schema (`docs/DATABASE_SCHEMA.md`)
- [x] Copy this checklist and keep it updated after each work session

---

## Phase 1 — Infrastructure skeleton

- [x] Create `frontend/` (Next.js + TypeScript)
- [x] Create `backend/` (Fastify + TypeScript)
- [x] Create `worker/` (BullMQ consumer)
- [x] Create `database/migrations/` directory
- [x] Add `docker-compose.yml` (Postgres, Redis, api, worker, frontend)
- [x] Add `.env.example` (no real secrets)
- [x] Wire startup commands in root or package README
- [x] First migration: organisations, users (minimal)
- [x] Seed script: 2 orgs × 3 roles with sample credentials
- [x] `GET /health` and `GET /ready` on API
- [x] Verify: `docker compose up` starts all services cleanly

---

## Phase 2 — Authentication, roles & organisation isolation

**Requirement weight: 20% — do this before most feature work**

- [x] Secure password hashing (argon2)
- [x] `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- [x] JWT in httpOnly cookie; frontend uses `credentials: 'include'`
- [x] Auth middleware attaches `{ userId, organisationId, role }`
- [x] Role guard helpers (`requireRole`, etc.)
- [x] Every tenant query scoped by `organisation_id` from JWT — never from client body
- [x] Cross-org access returns 404/403 appropriately (no data leak)
- [x] Rate limit on login endpoint
- [x] Login page on frontend
- [x] **Tests:** auth success/failure, role denial, cross-org ID tampering

---

## Phase 3 — Work order management

- [x] Migration: `work_orders` table with all required fields
- [x] CRUD API with org scope and role checks
- [x] Assign technician endpoint
- [x] Update status endpoint
- [x] List API: search, filter, sort, pagination
- [x] Detail API with activity/history
- [x] Dashboard summary counts endpoint
- [x] Frontend: work order list (filters, pagination)
- [x] Frontend: create / edit forms
- [x] Frontend: detail page
- [x] Frontend: dashboard
- [x] Loading, empty, validation, and error states
- [x] **Tests:** work order validation, role restrictions on CRUD

---

## Phase 4 — Concurrent scheduling protection

**Requirement weight: 18% (PostgreSQL / concurrency)**

- [x] Validate `scheduled_start` < `scheduled_end`
- [x] Overlap detection in transaction (`SELECT … FOR UPDATE` or equivalent)
- [x] PostgreSQL exclusion constraint as backstop (see ARCHITECTURE_DECISIONS §8)
- [x] Return `409 SCHEDULING_CONFLICT` with clear message
- [x] Document why this is safe with multiple API instances — see [SCHEDULING_CONCURRENCY.md](./SCHEDULING_CONCURRENCY.md)
- [x] Frontend: show conflict error when assign fails
- [x] **Tests:** concurrent parallel assign requests → exactly one succeeds

---

## Phase 5 — Idempotent progress events

- [x] `POST /progress-events` endpoint
- [x] Zod validation: eventId, workOrderId, type, occurredAt, payload
- [x] Authorisation: technician, assigned to work order only
- [x] Immutable `progress_events` row stored on accept
- [x] Unique index on `event_id`; duplicate returns same success response
- [x] Atomic work order update in same transaction
- [x] Rollback on failure — no partial DB state
- [x] Rate limit on event submission
- [x] Document idempotency mechanism in TECHNICAL_NOTES
- [x] **Tests:** duplicate eventId, concurrent duplicate submissions

---

## Phase 6 — Attachments & storage quotas

- [x] Migration: attachments table + org storage tracking
- [x] Upload endpoint with multipart handling
- [x] Backend MIME + size validation (images + PDF)
- [x] UUID storage keys; original filename not used on disk
- [x] Configurable org storage limit enforced on upload
- [x] Authenticated download; no public filesystem paths in API
- [x] Frontend: upload UI on work order detail
- [x] Document production object-storage migration path
- [x] **Tests:** type rejection, size rejection, quota exceeded, unauthorised download

---

## Phase 7 — Background notification processing

- [x] Enqueue job on work order assignment (deterministic job ID)
- [x] Worker runs independently from API process
- [x] Mock notification provider (success / transient / permanent modes)
- [x] Retry transient failures with exponential backoff
- [x] Stop retrying permanent failures
- [x] Record attempts and final outcomes in DB
- [x] No duplicate notifications for same assignment
- [x] Structured worker logs
- [x] **Tests:** retry behaviour, permanent failure, duplicate delivery prevention

---

## Phase 8 — Real-time updates

- [x] WebSocket (or SSE) endpoint with authentication
- [x] Org-scoped rooms — no cross-org events
- [x] Publish events on work order create/update/assign
- [x] Frontend: connect on dashboard/list; update without full refresh
- [x] Client reconnect with backoff; refetch snapshot on reconnect
- [x] Document behaviour when real-time is temporarily unavailable
- [x] **Tests:** cross-org WebSocket isolation

---

## Phase 9 — Audit history & CSV export

### Audit

- [x] Append-only `audit_logs` table
- [x] Log: create, assign, status change, attachment, role change, notification outcome
- [x] Each entry: org, actor, action, target, timestamp, before/after metadata
- [x] No edit/delete audit endpoints

### CSV export

- [x] `GET /exports/work-orders.csv` with same auth as list API
- [x] Org-scoped; respects filters
- [x] Streaming/chunked query — not all rows in memory
- [x] CSV formula-injection prevention
- [x] **Tests:** Org A export excludes Org B records

---

## Phase 10 — Frontend completeness

- [x] Responsive layout (desktop + mobile)
- [x] Role-based UI (UX only; backend still enforces)
- [x] Technician view: assigned work only
- [x] Conflict state UI for scheduling errors
- [x] Attachment upload and download flows
- [x] Real-time dashboard/list updates visible in UI
- [x] **E2E test:** one critical workflow (login → create → assign → update)

---

## Phase 11 — API & operational quality

- [x] Centralised Zod validation on all inputs
- [x] Consistent error response envelope + correlation IDs
- [x] Structured logging (pino)
- [x] Request correlation ID middleware
- [x] Graceful shutdown (SIGTERM)
- [x] Environment-based configuration
- [x] Appropriate DB indexes (see ARCHITECTURE_DECISIONS §5.4)
- [x] No secrets in source control
- [x] `.gitignore` covers `.env`, `node_modules`, uploads, build output

---

## Phase 12 — Automated testing (sign-off)

Cross-check against `docs/ASSESSMENT.md` §12:

- [x] Successful and failed authentication
- [x] Role restrictions
- [x] Cross-organisation access attempts
- [x] Cross-organisation real-time isolation
- [x] Work-order validation
- [x] Concurrent scheduling conflicts
- [x] Duplicate and concurrent event submission
- [x] Transaction rollback
- [x] Attachment type, size, quota and access control
- [x] Worker retries and duplicate delivery
- [x] Organisation-scoped CSV export
- [x] One important frontend workflow
- [x] Integration tests use real PostgreSQL where DB behaviour matters
- [x] All test/lint/build commands documented and passing

---

## Phase 13 — Documentation & submission

### Technical documentation

- [x] Update root `README.md` with startup, test, lint, build commands
- [x] Complete `candidate-submission/TECHNICAL_NOTES.md`
- [x] Complete `candidate-submission/AI_USAGE.md`
- [x] Sample login credentials documented
- [x] Architecture, DB model, auth, concurrency, queue behaviour explained
- [x] Assumptions, limitations, and incomplete areas stated honestly

### Git & PR

- [ ] Clear, logical commit history (no generic "update" / "final" messages)
- [ ] Push branch: `git push -u origin assessment/suhailkc`
- [ ] Open PR: your fork → `DT-Gatlier/fielddesk-fullstack-assessment:main`
- [ ] Fill every section of PR template
- [ ] Include final commit SHA in PR

### Screen recording (10–15 min)

- [ ] Documented startup process
- [ ] Login as users from **two different organisations**
- [ ] Role restrictions demonstrated
- [ ] Main frontend workflows
- [ ] Scheduling conflict handling
- [ ] Attachment upload and access control
- [ ] Real-time updates
- [ ] Background job success and failure behaviour
- [ ] Automated tests running
- [ ] No passwords/tokens/personal info exposed in recording

### Final confirmation

- [x] No `.env` or credentials committed
- [x] App starts from documented commands on a clean machine (Docker)
- [x] You can explain and modify every part of the submission

---

## Session log (optional)

Record brief notes after each work session:

| Date | Completed | Next up |
| --- | --- | --- |
| 2026-09-08 | Planning: architecture doc, checklist created | Phase 0 finish |
| 2026-09-08 | Phase 0 complete: stack locked, ERD/schema doc, checklist updated | Phase 1 skeleton |
| 2026-09-08 | Phase 1 scaffold: docker-compose, backend/worker/frontend, migrations, seed | Verify docker compose; Phase 2 auth |
| 2026-09-08 | Phase 2: auth API, JWT cookies, login/dashboard, integration tests | Phase 3 work orders |
| 2026-09-08 | Phase 3: work orders CRUD, dashboard, frontend flows, 7 tests | Phase 4 scheduling concurrency |
| 2026-09-08 | Phase 4: exclusion constraint, transactional assign, concurrency tests | Phase 5 progress events |
| 2026-09-09 | Phase 5: idempotent progress-events API, tests, TECHNICAL_NOTES | Phase 6 attachments |
| 2026-09-09 | Phase 6: attachments upload/download, quotas, tests, frontend | Phase 7 background worker |
| 2026-09-11 | Phase 7: BullMQ notifications, worker, dedupe, tests | Phase 8 real-time |
| 2026-09-11 | Phase 8: WebSocket org rooms, frontend reconnect, isolation test | Phase 9 CSV export |
| 2026-09-11 | Phases 9–11: CSV export, critical workflow, ops quality, test sign-off | Phase 13 submission docs |
| | | |

---

## Quick daily rule

1. Pick **one phase** (or one subsection) as today's goal.
2. Implement → test → check the boxes.
3. Commit with a clear message.
4. Update **Progress summary** and **Session log** before stopping.

Do not move to UI polish until Phase 2 tests pass.
