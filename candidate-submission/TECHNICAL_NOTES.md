# Technical notes

Complete this document as part of the submission.

## Candidate

- Name:
- GitHub username:
- Final commit SHA:
- Screen-recording link:

## Local setup

Document the exact commands required to configure and start the application.

## Sample accounts

List the seeded organisations, roles and sample login credentials. Use assessment-only credentials.

## Verification results

| Check | Command | Result |
| --- | --- | --- |
| Backend tests |  |  |
| Frontend tests |  |  |
| Integration tests |  |  |
| Lint |  |  |
| Build |  |  |

## Architecture

Describe the major components, their responsibilities and important dependencies.

## Database design

Explain the principal tables, relationships, constraints, indexes and migration strategy.

## Authentication, roles and organisation isolation

Explain how authentication works and where organisation and role restrictions are enforced.

## Transactions, idempotency and concurrency

### Concurrent scheduling protection (Phase 4 — implemented)

Overlapping technician assignments are prevented using **two layers**:

1. **Transaction + overlap query** — `assignWorkOrderSafely()` locks the work order and conflicting rows with `FOR UPDATE`, checks `tstzrange` overlap, and returns `409 SCHEDULING_CONFLICT` before updating when a conflict is found.
2. **PostgreSQL exclusion constraint** — `work_orders_no_overlap` (migration `004`) rejects any commit that would create overlapping non-cancelled assignments for the same technician.

This is **safe with multiple API instances** because coordination lives entirely in PostgreSQL, not in application memory. Stateless API replicas share one database; concurrent assign requests serialise via row locks and the exclusion constraint. One request succeeds, the other receives `409`.

See [docs/SCHEDULING_CONCURRENCY.md](../docs/SCHEDULING_CONCURRENCY.md) for the full flow, error codes, and test commands.

### Progress event idempotency (Phase 5 — pending)

_To be documented when progress-events API is implemented._

## Background jobs

Explain delivery guarantees, retries, backoff, duplicate prevention and permanent failure handling.

## Real-time updates

Explain connection authentication, organisation isolation, reconnection and degraded behaviour.

## File security and storage limits

Explain validation, authorisation, quota enforcement and the production object-storage approach.

## Security considerations

Describe relevant threats considered and the protections implemented.

## Production deployment and operations

Explain how you would deploy, scale, monitor, back up and recover the application.

## Assumptions and trade-offs

List significant assumptions and explain important trade-offs.

## Known limitations or incomplete requirements

List anything incomplete or not working. If none, state that explicitly.
