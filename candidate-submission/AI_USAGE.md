# AI usage disclosure

AI-assisted development tools are permitted for this assessment. Their use does not reduce the score by itself. Transparency, independent verification and understanding of the submitted work are required.

List every AI tool used, including coding assistants, chat tools, code generators, design generators and automated review tools.

If no AI tool was used, write: **No AI-assisted tools were used for this submission.**

## Usage summary

| Tool and model, if known | Files, features or sections affected | Purpose of use | Nature of the output | How I reviewed or tested it |
| :--- | :--- | :--- | :--- | :--- |
| Google Antigravity (Gemini 3.8 Flash) | `backend/src/api/routes/auth.routes.ts`, `backend/src/services/auth.service.ts`, `backend/src/repositories/user.repository.ts`, `tests/isolation/auth-and-tenant.test.ts` | Implementing Feature 01: Auth, RBAC, Multi-Tenant Isolation & Token Rotation | Layered Express routes, JWT validation, bcrypt password hashing, test suite | Executed `npm run test:isolation` (15/15 passing), verified token expiration and single-use refresh token rotation |
| Google Antigravity (Gemini 3.8 Flash) | `backend/src/services/work-order.service.ts`, `backend/src/repositories/work-order.repository.ts`, `tests/isolation/work-orders.test.ts`, `frontend/src/modules/Common/WorkOrders/*` | Implementing Feature 02: Work Order Management, Sequence Generation, Dashboard Counts, Redis Cache | Service logic, SQL queries, Redis cache, React UI modals, TanStack Query hooks | Executed full test suite `npm run test:isolation` (15/15 passing), verified multi-tenant scoping and 404 anti-enumeration |
| Google Antigravity (Gemini 3.8 Flash) | `backend/src/services/work-order.service.ts`, `database/migrations/004_concurrency_constraints.sql`, `tests/concurrency/scheduling-concurrency.test.ts` | Implementing Feature 03: Scheduling & Concurrency Engine with GiST exclusions & advisory locks | Concurrency logic, SQL exclusion constraint, advisory locking queries, race condition tests | Executed `npm run test:concurrency` (8/8 passing), verified parallel overlapping request safety with `Promise.all` |
| Google Antigravity (Gemini 3.8 Flash) | `backend/src/services/event.service.ts`, `backend/src/api/dtos/event.dto.ts`, `tests/concurrency/event-idempotency.test.ts` | Implementing Feature 04: Progress-Event API & Dual-Store Idempotency Engine | Atomic transaction handling, fast-path Redis + durable PG deduplication, unit tests | Executed `npm run test:concurrency` (8/8 passing), verified duplicate event handling and transaction rollback |
| Google Antigravity (Gemini 3.8 Flash) | `backend/src/services/attachment.service.ts`, `backend/src/api/middlewares/file-validator.ts`, `tests/isolation/attachment-quota.test.ts` | Implementing Feature 05: Attachments, Magic-Byte Inspection, Storage Quotas | Multer middleware, binary magic byte inspector, quota check queries, isolation tests | Executed `npm run test:isolation` (14/14 passing), verified 10MB limits, quota rejection, and MIME spoofing prevention |
| Google Antigravity (Gemini 3.8 Flash) | `worker/src/*`, `docker-compose.yml`, `tests/isolation/worker-retry.test.ts` | Implementing Feature 06: Standalone BullMQ Worker & Mock Notifications | Standalone worker package, exponential backoff retries, controllable mock provider, Dockerfile | Executed `npm run test:worker` (3/3 passing) and `npm run test:isolation` (8/8 passing), verified backoff calculation and permanent failure termination |
| Google Antigravity (Gemini 3.8 Flash) | `backend/src/realtime/*`, `frontend/src/app/shared/hooks/useRealtimeUpdates.ts`, `tests/isolation/realtime-isolation.test.ts` | Implementing Feature 07: Real-Time SSE Stream with Tenant Isolation | Server-Sent Events connection manager, 25s heartbeat pings, React auto-reconnect hook | Executed `npm run test:isolation` (6/6 passing), verified Apex clients receive updates while Summit clients receive 0 events |
| Google Antigravity (Gemini 3.8 Flash) | `backend/src/services/audit.service.ts`, `tests/isolation/audit-history.test.ts` | Implementing Feature 08: Immutable Audit History & Activity Timeline | Append-only audit logger, state diff tracking, timeline API endpoint, isolation tests | Executed `npm run test:isolation` (11/11 passing), verified immutability and before/after state diff preservation |
| Google Antigravity (Gemini 3.8 Flash) | `backend/src/services/report.service.ts`, `tests/isolation/csv-export.test.ts` | Implementing Feature 09: Secure Streaming CSV Export | Transform stream, formula injection sanitization (`=, +, -, @, \t, \r`), isolation tests | Executed `npm run test:isolation` (9/9 passing), verified role guards and tenant boundary enforcement |
| Google Antigravity (Gemini 3.8 Flash) | `backend/src/infrastructure/logger.ts`, `backend/src/api/middlewares/*`, `tests/isolation/operational-quality.test.ts` | Implementing Feature 10: Operational Quality, Pino Log Redaction, Rate Limits, Probes | Correlation ID middleware (`AsyncLocalStorage`), Pino JSON logger with redaction, sliding-window rate limiters, `/healthz` & `/readyz` | Executed `npm run test:isolation` (10/10 passing), verified 429 Retry-After headers and sensitive credential redaction |

## Details

For each material use of AI, describe:

1. **What you asked the tool to help with:**
   - Architecture scaffolding and implementing the multi-tenant REST API, standalone BullMQ worker service, React frontend dashboard, and automated test suites strictly aligned with Gatlier's assessment brief.
   - Diagnosing and resolving test runner configuration issues and ensuring the project repository matches the exact directory structure specified in `docs/ASSESSMENT.md`.
2. **Which parts of the submission were generated or substantially modified:**
   - Layered backend implementation (`backend/src/`), standalone worker (`worker/src/`), React frontend modules (`frontend/src/`), database migrations (`database/migrations/`), and comprehensive isolation, concurrency, and unit test suites (`tests/`).
3. **What you changed after receiving the output:**
   - Refactored the worker into its own root-level package (`worker/`) to strictly honor the expected repository structure in `docs/ASSESSMENT.md`.
   - Verified that all SQL queries strictly enforce tenant scoping (`WHERE organisation_id = $1`) and return HTTP 404 on cross-tenant resource access to prevent ID enumeration.
   - Refined rate limiting parameters, correlation ID propagation across `AsyncLocalStorage`, and CSV formula sanitization.
4. **How you verified correctness, security and compatibility:**
   - Executed unified test suite (`npm run test:all`) verifying 128 tests passing across 15 suites with 100% pass rate.
   - Verified production builds (`npm run build`) across backend, worker, and frontend with 0 TypeScript and 0 Vite build errors.
   - Verified Docker Compose schema (`docker compose config --quiet`).
5. **Any output you rejected and why:**
   - Rejected keeping the background worker embedded inside `backend/src/workers/` because the assessment brief explicitly requires the worker to run independently and specifies a root-level `worker/` directory in the repository structure.

## Candidate confirmation

Replace the unchecked boxes with checked boxes when true:

- [x] I have disclosed all AI-assisted work in this submission.
- [x] I personally reviewed every submitted file.
- [x] I can explain and modify every part of the implementation.
- [x] I independently ran the documented tests and checks.
- [x] I did not submit confidential or proprietary third-party material.

Candidate name: Abrar Aboobacker

Date: 2026-11-13
