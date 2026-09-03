---
labels: ["ready-for-agent"]
---
## Parent
[docs/PRD-Frontend.md](../PRD-Frontend.md)

## What to build
Build the core `/dispatcher` route featuring a full-width Data Table hooked up to the work-order API. Implement search, filter, sort, and pagination logic entirely in the table component.

## Acceptance criteria
- [x] Data Table renders work orders with all required columns.
- [x] Dispatcher can search, filter, sort, and paginate through results.
- [x] Integration tests (RTL + MSW) verify that table filtering and pagination update the UI correctly based on mocked API responses.

## Blocked by
- [09-frontend-routing-owner-dashboard.md](09-frontend-routing-owner-dashboard.md)
