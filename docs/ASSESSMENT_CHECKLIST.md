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
| 3. Work orders core | ⬜ Not started | Next up |
| 4. Scheduling & concurrency | ⬜ Not started | |
| 5. Progress events | ⬜ Not started | |
| 6. Attachments & quotas | ⬜ Not started | |
| 7. Background worker | ⬜ Not started | |
| 8. Real-time updates | ⬜ Not started | |
| 9. Audit & CSV export | ⬜ Not started | |
| 10. Frontend workflows | ⬜ Not started | |
| 11. Ops & API quality | ⬜ Not started | |
| 12. Testing | ⬜ Not started | |
| 13. Documentation & submission | ⬜ Not started | |

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

- [ ] Migration: `work_orders` table with all required fields
- [ ] CRUD API with org scope and role checks
- [ ] Assign technician endpoint
- [ ] Update status endpoint
- [ ] List API: search, filter, sort, pagination
- [ ] Detail API with activity/history
- [ ] Dashboard summary counts endpoint
- [ ] Frontend: work order list (filters, pagination)
- [ ] Frontend: create / edit forms
- [ ] Frontend: detail page
- [ ] Frontend: dashboard
- [ ] Loading, empty, validation, and error states
- [ ] **Tests:** work order validation, role restrictions on CRUD

---

## Phase 4 — Concurrent scheduling protection

**Requirement weight: 18% (PostgreSQL / concurrency)**

- [ ] Validate `scheduled_start` < `scheduled_end`
- [ ] Overlap detection in transaction (`SELECT … FOR UPDATE` or equivalent)
- [ ] PostgreSQL exclusion constraint as backstop (see ARCHITECTURE_DECISIONS §8)
- [ ] Return `409 SCHEDULING_CONFLICT` with clear message
- [ ] Document why this is safe with multiple API instances
- [ ] Frontend: show conflict error when assign fails
- [ ] **Tests:** concurrent parallel assign requests → exactly one succeeds

---

## Phase 5 — Idempotent progress events

- [ ] `POST /progress-events` endpoint
- [ ] Zod validation: eventId, workOrderId, type, occurredAt, payload
- [ ] Authorisation: technician, assigned to work order only
- [ ] Immutable `progress_events` row stored on accept
- [ ] Unique index on `event_id`; duplicate returns same success response
- [ ] Atomic work order update in same transaction
- [ ] Rollback on failure — no partial DB state
- [ ] Rate limit on event submission
- [ ] Document idempotency mechanism in TECHNICAL_NOTES
- [ ] **Tests:** duplicate eventId, concurrent duplicate submissions

---

## Phase 6 — Attachments & storage quotas

- [ ] Migration: attachments table + org storage tracking
- [ ] Upload endpoint with multipart handling
- [ ] Backend MIME + size validation (images + PDF)
- [ ] UUID storage keys; original filename not used on disk
- [ ] Configurable org storage limit enforced on upload
- [ ] Authenticated download; no public filesystem paths in API
- [ ] Frontend: upload UI on work order detail
- [ ] Document production object-storage migration path
- [ ] **Tests:** type rejection, size rejection, quota exceeded, unauthorised download

---

## Phase 7 — Background notification processing

- [ ] Enqueue job on work order assignment (deterministic job ID)
- [ ] Worker runs independently from API process
- [ ] Mock notification provider (success / transient / permanent modes)
- [ ] Retry transient failures with exponential backoff
- [ ] Stop retrying permanent failures
- [ ] Record attempts and final outcomes in DB
- [ ] No duplicate notifications for same assignment
- [ ] Structured worker logs
- [ ] **Tests:** retry behaviour, permanent failure, duplicate delivery prevention

---

## Phase 8 — Real-time updates

- [ ] WebSocket (or SSE) endpoint with authentication
- [ ] Org-scoped rooms — no cross-org events
- [ ] Publish events on work order create/update/assign
- [ ] Frontend: connect on dashboard/list; update without full refresh
- [ ] Client reconnect with backoff; refetch snapshot on reconnect
- [ ] Document behaviour when real-time is temporarily unavailable
- [ ] **Tests:** cross-org WebSocket isolation

---

## Phase 9 — Audit history & CSV export

### Audit

- [ ] Append-only `audit_logs` table
- [ ] Log: create, assign, status change, attachment, role change, notification outcome
- [ ] Each entry: org, actor, action, target, timestamp, before/after metadata
- [ ] No edit/delete audit endpoints

### CSV export

- [ ] `GET /exports/work-orders.csv` with same auth as list API
- [ ] Org-scoped; respects filters
- [ ] Streaming/chunked query — not all rows in memory
- [ ] CSV formula-injection prevention
- [ ] **Tests:** Org A export excludes Org B records

---

## Phase 10 — Frontend completeness

- [ ] Responsive layout (desktop + mobile)
- [ ] Role-based UI (UX only; backend still enforces)
- [ ] Technician view: assigned work only
- [ ] Conflict state UI for scheduling errors
- [ ] Attachment upload and download flows
- [ ] Real-time dashboard/list updates visible in UI
- [ ] **E2E test:** one critical workflow (login → create → assign → update)

---

## Phase 11 — API & operational quality

- [ ] Centralised Zod validation on all inputs
- [ ] Consistent error response envelope + correlation IDs
- [ ] Structured logging (pino)
- [ ] Request correlation ID middleware
- [ ] Graceful shutdown (SIGTERM)
- [ ] Environment-based configuration
- [ ] Appropriate DB indexes (see ARCHITECTURE_DECISIONS §5.4)
- [ ] No secrets in source control
- [ ] `.gitignore` covers `.env`, `node_modules`, uploads, build output

---

## Phase 12 — Automated testing (sign-off)

Cross-check against `docs/ASSESSMENT.md` §12:

- [ ] Successful and failed authentication
- [ ] Role restrictions
- [ ] Cross-organisation access attempts
- [ ] Cross-organisation real-time isolation
- [ ] Work-order validation
- [ ] Concurrent scheduling conflicts
- [ ] Duplicate and concurrent event submission
- [ ] Transaction rollback
- [ ] Attachment type, size, quota and access control
- [ ] Worker retries and duplicate delivery
- [ ] Organisation-scoped CSV export
- [ ] One important frontend workflow
- [ ] Integration tests use real PostgreSQL where DB behaviour matters
- [ ] All test/lint/build commands documented and passing

---

## Phase 13 — Documentation & submission

### Technical documentation

- [ ] Update root `README.md` with startup, test, lint, build commands
- [ ] Complete `candidate-submission/TECHNICAL_NOTES.md`
- [ ] Complete `candidate-submission/AI_USAGE.md`
- [ ] Sample login credentials documented
- [ ] Architecture, DB model, auth, concurrency, queue behaviour explained
- [ ] Assumptions, limitations, and incomplete areas stated honestly

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

- [ ] No `.env` or credentials committed
- [ ] App starts from documented commands on a clean machine (Docker)
- [ ] You can explain and modify every part of the submission

---

## Session log (optional)

Record brief notes after each work session:

| Date | Completed | Next up |
| --- | --- | --- |
| 2026-09-08 | Planning: architecture doc, checklist created | Phase 0 finish |
| 2026-09-08 | Phase 0 complete: stack locked, ERD/schema doc, checklist updated | Phase 1 skeleton |
| 2026-09-08 | Phase 1 scaffold: docker-compose, backend/worker/frontend, migrations, seed | Verify docker compose; Phase 2 auth |
| 2026-09-08 | Phase 2: auth API, JWT cookies, login/dashboard, integration tests | Phase 3 work orders |
| | | |

---

## Quick daily rule

1. Pick **one phase** (or one subsection) as today's goal.
2. Implement → test → check the boxes.
3. Commit with a clear message.
4. Update **Progress summary** and **Session log** before stopping.

Do not move to UI polish until Phase 2 tests pass.
