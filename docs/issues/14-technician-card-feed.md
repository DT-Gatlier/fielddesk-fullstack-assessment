---
labels: ["ready-for-agent"]
---
## Parent
[docs/PRD-Frontend.md](../PRD-Frontend.md)

## What to build
Build the `/technician` route displaying assigned work orders as a mobile-optimized vertical card feed. Use CSS Grid to ensure the feed transitions into a multi-column card layout on desktop breakpoints, avoiding the use of a data table.

## Acceptance criteria
- [ ] Cards display essential work order details (Time, Site, Priority, Status).
- [ ] Layout is a single column on mobile screens.
- [ ] Layout transitions to a responsive 2-3 column grid on desktop screens.
- [ ] Playwright E2E tests verify the layout behavior across different viewport sizes.

## Blocked by
- [09-frontend-routing-owner-dashboard.md](09-frontend-routing-owner-dashboard.md)
