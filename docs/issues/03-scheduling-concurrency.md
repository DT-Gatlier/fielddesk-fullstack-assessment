## What to build

Introduce the `tstzrange` column for scheduled work and the GiST exclusion constraint. Build the assignment API endpoint and the frontend UI to assign technicians.

## Acceptance criteria

- [ ] Database constraint prevents overlapping assignments for the same technician.
- [ ] API returns a 409 Conflict gracefully when overlap occurs.
- [ ] UI allows technician assignment and correctly displays conflict errors.
- [ ] Automated concurrency test (`asyncio.gather`) passes, proving the constraint blocks simultaneous conflicting requests.

## Blocked by

- docs/issues/02-core-crud.md
