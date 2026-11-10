# Assessment requirement coverage

This maps the supplied brief to implemented features and repeatable evidence. Production trade-offs and environment-dependent verification are recorded in candidate-submission/TECHNICAL_NOTES.md.

| Brief section | Implementation | Evidence |
| --- | --- | --- |
| 1. Authentication, roles, tenants | Bcrypt, HttpOnly JWT plus revocable database session, current database role/tenant checks, two seeded organisations and six accounts | Authentication, logout replay, cross-tenant IDs/payloads, technician filter override and owner-role tests |
| 2. Work orders | Persisted fields, create/edit/status/assignment, shared validated search/filter/sort, pagination, dashboard, details/history | API tests; browser create/edit/reload/export workflow |
| Empty-database workflow | Owner/dispatcher creates customers from the work-order form; tenant is derived from the session; creation and audit commit together | Customer validation/role/tenant integration test; browser creates a customer then a persisted work order |
| 3. Concurrent scheduling | PostgreSQL GiST exclusion constraint, validated half-open intervals, atomic write/audit/outbox | Concurrent database writes and simultaneous HTTP assignments: one succeeds, one gets 409 |
| 4. Progress events | Strict type/payload/timestamp checks, locked assignment recheck, original request retention, unique event ID and atomic status/audit changes | Duplicate/concurrent submissions, changed-content rejection, forced database conflict rollback |
| 5. Attachments | Backend type/signature/5 MiB checks, UUID identifiers, authorized downloads, transactional quota reservation | Content, size, quota and cross-tenant access tests |
| 6. Background processing | Independent BullMQ worker, PostgreSQL outbox, exponential retry, permanent failure, durable mock receipt and attempts | Database-backed processor retry/duplicate tests; opt-in real Redis queue test |
| 7. Realtime | Authenticated tenant SSE invalidations, reconnect refresh and polling fallback | Cross-tenant SSE test; documented process-local delivery/scaling limits |
| 8. Audit | Work snapshots, assignment/status changes, upload/user/organisation actions and notification outcomes | Read-only paginated tenant and job history endpoints; tenant/role tests |
| 9. Frontend | Role-specific navigation, work forms/details, schedule, reports, owner settings, upload/progress, loading/saving/empty/error states, responsive layout | Five Playwright workflows covering persisted edits, navigation, roles and mobile |
| 10. CSV | Shared list/export authorization and filters, cursor batches, backpressure and formula escaping | Tenant isolation, technician scope and formula-injection tests |
| 11. Operations | Validation, consistent errors, correlation IDs, structured logs, liveness/readiness, shutdown, environment configuration, migrations/indexes and rate limits | Integration/build/type checks; documented distributed rate-limit limitation |
| 12. Tests | Real PostgreSQL integration suite and Chromium browser suite | npm test; RUN_QUEUE_TESTS=1 npm test with Redis; npm run test:browser |
| 13. Local operation | Compose services, Dockerfile, migration prerequisite, explicit seed, environment example and README | CI workflow provisions PostgreSQL/Redis, runs browser tests and builds the image; local Docker execution unavailable |

No deployment, final commit, PR or screen recording is implied by this matrix. Those submission artifacts require the candidate's review and completion.
