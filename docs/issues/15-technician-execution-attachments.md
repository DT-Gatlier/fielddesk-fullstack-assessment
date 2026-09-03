---
labels: ["ready-for-agent"]
---
## Parent
[docs/PRD-Frontend.md](../PRD-Frontend.md)

## What to build
Add a touch-friendly detail view for the Technician (opened by tapping a card) containing large action buttons for state transitions (e.g., Start Work, Complete Work). Implement a prominent file upload UI for attaching images/PDFs.

## Acceptance criteria
- [x] Tapping a card opens the detail execution view.
- [x] Technician can transition work order states via large, touch-friendly buttons.
- [x] Technician can upload image/PDF attachments.
- [x] Integration tests verify state transitions and file upload handling via MSW.

## Blocked by
- [14-technician-card-feed.md](14-technician-card-feed.md)
