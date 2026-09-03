# Commit Message Example

When creating commit messages, follow the conventional commit format and use bulleted lists to break down specific changes by domain (e.g., Frontend, Backend, Docs). 

### Example

```text
feat(owner): implement owner management tools

- Frontend:
  - Fixed IPv6 connection refused issue by changing localhost to 127.0.0.1 in API base URL
  - Added timestamp to CSV export filename in Owner Dashboard
  - Wrote Playwright E2E tests for Owner Dashboard

- Backend:
  - Added /organisation/quota endpoint for storage metrics
  - Added /users endpoints (GET, POST, PATCH) for user management and role assignment
  - Added corresponding Pydantic schemas (QuotaResponse, UserWithRoleResponse, UserInvite, UserRoleUpdate)

- Docs:
  - Marked issue 10 acceptance criteria as complete
```
