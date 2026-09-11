# AI usage disclosure

## Usage summary

| Tool and model, if known | Files, features or sections affected | Purpose of use | Nature of the output | How I reviewed or tested it |
| --- | --- | --- | --- | --- |
| Cursor (Claude) | Entire codebase across phases 0–13 | Architecture planning, implementation scaffolding, test writing, documentation | Generated and modified TypeScript/SQL/React across backend, worker, frontend, migrations, tests, and docs | Ran `npm test` (36 tests), `npm run typecheck`, `npm run build`; manually reviewed security-sensitive paths (auth, tenant isolation, scheduling transactions) |
| Cursor (Claude) | `docs/ARCHITECTURE_DECISIONS.md`, `docs/SCHEDULING_CONCURRENCY.md`, checklist | Drafting technical documentation from implementation | Structured markdown documentation | Cross-checked against actual code and test behaviour |
| Cursor (Claude) | `backend/tests/*.test.ts` | Integration test patterns and edge cases | Test scaffolding and assertions | Verified each test passes against real PostgreSQL |

## Details

1. **What I asked for:** incremental phase-by-phase implementation of the FieldDesk assessment (auth, work orders, scheduling concurrency, progress events, attachments, notifications, WebSocket, CSV export, ops quality, tests, documentation).
2. **Generated/modified:** backend API services and routes, worker, frontend pages, SQL migrations, integration tests, Docker setup, and submission docs.
3. **Changes after output:** adjusted scheduling test isolation (unique time windows), fixed WebSocket test race condition, added ZodError handling for path params, verified all tenant queries use JWT org scope.
4. **Verification:** 36 integration tests on real Postgres; TypeScript typecheck; production build; manual review of auth middleware and scheduling transactions.
5. **Rejected output:** initial WebSocket test using `injectWS().nextMessage()` (API mismatch) — replaced with `ws` client and proper listener timing.

## Candidate confirmation

- [x] I have disclosed all AI-assisted work in this submission.
- [x] I personally reviewed every submitted file.
- [x] I can explain and modify every part of the implementation.
- [x] I independently ran the documented tests and checks.
- [x] I did not submit confidential or proprietary third-party material.

Candidate name: Suhail KC

Date: 2026-09-11
