---
labels: ["ready-for-agent"]
---
## Parent
[docs/PRD-Frontend.md](../PRD-Frontend.md)

## What to build
Expand the Owner dashboard to include a Storage Quota visual progress bar, a User Management section to invite/edit users and assign roles, and a button to trigger the organisation-scoped CSV export.

## Acceptance criteria
- [ ] Storage quota is visualized as a progress bar (Used vs Limit).
- [ ] Owner can view a list of users, invite new ones, and assign roles.
- [ ] CSV Export button successfully triggers a download.
- [ ] Integration tests verify UI interactions using MSW.

## Blocked by
- [09-frontend-routing-owner-dashboard.md](09-frontend-routing-owner-dashboard.md)
