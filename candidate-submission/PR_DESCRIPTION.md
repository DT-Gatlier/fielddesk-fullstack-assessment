# FieldDesk assessment submission

## Candidate

- Name: Fayiz K V
- GitHub username: `Fayizkv`
- Final commit SHA: **ADD FINAL SHA**

## Submission

- Screen-recording link: **ADD RECORDING LINK**
- Main implementation summary: Full-stack field-service app with backend-enforced roles and organisation isolation, work-order scheduling, progress events, attachments, notifications, real-time updates, audit history, CSV export, and a responsive React frontend for the main user workflows.

## Verification

```text
npm test
PASS — backend: 14 passed, 2 PostgreSQL integration tests skipped
PASS — frontend: 1 passed

npm run lint
PASS — backend and frontend

npm run build
PASS — backend TypeScript build and frontend TypeScript/Vite production build

DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test -w backend
PENDING — run with a migrated PostgreSQL test database before opening the PR
```

## Requirements completed

- [x] Authentication, roles and organisation isolation
- [x] Work-order management
- [x] Concurrent scheduling protection
- [x] Idempotent progress-event processing
- [x] Attachments and storage quotas
- [x] Background notification processing
- [x] Real-time updates
- [x] Audit history
- [x] Frontend workflows and states
- [x] Organisation-scoped CSV export
- [x] Automated tests
- [x] Docker-based local setup
- [x] Documentation and submission templates

## AI-assisted work

- [x] `candidate-submission/AI_USAGE.md` is complete.
- [x] Every file or section materially affected by AI is identified.
- [ ] I personally reviewed, tested and understand all submitted work.

I used OpenAI Codex and Antigravity tools to move faster on the backend and frontend. I gave clear business scenarios, explained how the code should be arranged, and reused my own methods for building the base and core of the platform. The backend was documented first, and the frontend was integrated separately using the API documentation only. I reviewed the output and corrected anything that did not fit the rules.

## Known limitations

- Local attachment storage must be replaced by private object storage for a multi-instance production deployment.
- SSE is ephemeral; clients reconnect and refetch authoritative state, so updates occurring during a disconnection are not replayed.
- The final PostgreSQL-backed integration test run remains pending in an environment with Docker/PostgreSQL available.

## Final confirmation

- [x] No credentials, tokens or confidential third-party material are intentionally committed.
- [ ] The application starts using the documented commands.
- [ ] The commit SHA above is the final version demonstrated in the recording.
- [ ] I can explain and modify every part of this submission.

Before opening the PR, replace the two bold placeholders, run the PostgreSQL-backed tests and documented startup flow, then personally check the remaining confirmation boxes.
