---
labels: ["ready-for-agent"]
---
## Parent
[docs/PRD-Frontend.md](../PRD-Frontend.md)

## What to build
Connect the Dispatcher view to the WebSocket/SSE stream. When an event fires indicating a work order update, mutate the corresponding Data Table row in-place and trigger a brief visual highlight animation (e.g., green/yellow) without refreshing the page.

## Acceptance criteria
- [ ] Data Table rows update instantly when a WebSocket/SSE event is received.
- [ ] Updated rows briefly flash a highlight color to draw attention.
- [ ] RTL + MSW tests simulate a WebSocket event and verify the row mutation and styling change.

## Blocked by
- [11-dispatcher-data-table.md](11-dispatcher-data-table.md)
