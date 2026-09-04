## What to build

Build the Progress Events table with a `UNIQUE(event_id)` constraint. Create the technician API endpoint to submit events and atomically update the work order status.

## Acceptance criteria

- [x] Technician can submit progress events via the UI.
- [x] API handles duplicate `eventId` submissions idempotently (returns successful original response, no duplicate DB entries, no partial updates).
- [x] Work order status transitions are validated (e.g., cannot transition from `completed` to `open`).
- [x] Automated test verifies duplicate and concurrent event submission behavior.

## Blocked by

- docs/issues/02-core-crud.md
