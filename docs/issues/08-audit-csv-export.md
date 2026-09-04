## What to build

Create the `audit_logs` table (JSONB). Hook critical API actions to insert audit records. Build the streaming CSV export endpoint and UI components.

## Acceptance criteria

- [x] Audit records are created for work order creation, assignment changes, and status changes.
- [x] Audit data is strictly append-only and immutable.
- [x] Owner can trigger an organisation-scoped CSV export of work orders.
- [x] CSV export is streamed without loading the entire dataset into memory.
- [x] Spreadsheet-formula injection is prevented in the CSV export.

## Blocked by

- docs/issues/02-core-crud.md
- docs/issues/03-scheduling-concurrency.md
- docs/issues/04-progress-events.md
