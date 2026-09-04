---
labels: ["ready-for-agent"]
---
## Parent
[docs/PRD-Frontend.md](../PRD-Frontend.md)

## What to build
Introduce a slide-out Side Panel to the Dispatcher Data Table for viewing and editing work order details. Implement form logic that catches 409 Conflict errors (scheduling overlaps) from the backend and surfaces them as inline errors directly on the Time/Technician inputs, keeping the side panel open.

## Acceptance criteria
- [x] Clicking a row opens the Side Panel without losing list context.
- [x] Dispatcher can view details and submit edits.
- [x] A 409 Conflict response renders an inline error on the specific conflicting inputs (Time/Technician).
- [x] The Side Panel remains open after a 409 error.
- [x] E2E/Integration tests verify the 409 conflict UI state.

## Blocked by
- [11-dispatcher-data-table.md](11-dispatcher-data-table.md)
