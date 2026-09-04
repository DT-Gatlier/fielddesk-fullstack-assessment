---
labels: ["ready-for-agent"]
---
## Parent
[docs/PRD-Frontend.md](../PRD-Frontend.md)

## What to build
Expand the Owner dashboard to include a Storage Quota visual progress bar, a User Management section to invite/edit users and assign roles, and a button to trigger the organisation-scoped CSV export.

## Acceptance criteria
- [x] Storage quota is visualized as a progress bar (Used vs Limit).
- [x] Owner can view a list of users, invite new ones, and assign roles.
- [x] CSV Export button successfully triggers a download.
- [x] Integration tests verify UI interactions using MSW.

## Blocked by
- [09-frontend-routing-owner-dashboard.md](09-frontend-routing-owner-dashboard.md)
