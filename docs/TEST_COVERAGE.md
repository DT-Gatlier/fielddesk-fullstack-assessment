# Automated test coverage

Maps [ASSESSMENT.md §12](./ASSESSMENT.md) requirements to integration tests. All backend tests run against a real PostgreSQL instance with seeded data.

| Requirement | Test file | Notes |
| --- | --- | --- |
| Successful and failed authentication | `backend/tests/auth.test.ts` | Login, logout, invalid password, `/auth/me` |
| Role restrictions | `backend/tests/auth.test.ts`, `backend/tests/work-orders.test.ts` | User list denial; technician create denial |
| Cross-organisation access attempts | `backend/tests/auth.test.ts` | User lookup across orgs returns 404 |
| Cross-organisation real-time isolation | `backend/tests/realtime.test.ts` | WebSocket org rooms |
| Work-order validation | `backend/tests/work-orders.test.ts` | CRUD, list scoping, role checks |
| Concurrent scheduling conflicts | `backend/tests/scheduling.test.ts` | Parallel assign → one 200, one 409 |
| Duplicate and concurrent event submission | `backend/tests/progress-events.test.ts` | Idempotent `eventId`, parallel submits |
| Transaction rollback | `backend/tests/transaction-rollback.test.ts` | Failed progress event leaves no rows |
| Attachment type, size, quota and access control | `backend/tests/attachments.test.ts` | MIME, size, quota, unauthorised download |
| Worker retries and duplicate delivery | `backend/tests/notifications.test.ts` | Transient/permanent modes, dedupe |
| Organisation-scoped CSV export | `backend/tests/exports.test.ts` | Org A marker absent from Org B export |
| One important frontend workflow | `backend/tests/critical-workflow.test.ts` | Login → create → assign → status update |
| API operational quality | `backend/tests/api-quality.test.ts` | Correlation IDs, UUID validation |

## Commands

```bash
docker compose up postgres redis -d
npm run migrate
npm run seed
npm test          # 36 integration tests (backend)
npm run typecheck # backend + frontend TypeScript
npm run build     # backend tsc + Next.js build
```

**Frontend unit tests:** not required by the assessment brief; workflow correctness is covered by the critical-path integration test above.
