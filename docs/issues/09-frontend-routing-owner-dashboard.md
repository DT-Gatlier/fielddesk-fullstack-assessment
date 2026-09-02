---
labels: ["ready-for-agent"]
---
## Parent
[docs/PRD-Frontend.md](../PRD-Frontend.md)

## What to build
Establish the React Router logic to intercept login and route users to `/owner`, `/dispatcher`, or `/technician` based on their role. Scaffold the Owner dashboard page and build the Summary Counts widgets (Total Open, Completed) populated from the API.

## Acceptance criteria
- [x] A logged-in Owner is routed to `/owner`.
- [x] A logged-in Dispatcher is routed to `/dispatcher`.
- [x] A logged-in Technician is routed to `/technician`.
- [x] The Owner dashboard displays high-level summary counts.
- [x] Integration tests verify proper routing and summary rendering using MSW.

## Blocked by
- None - can start immediately
