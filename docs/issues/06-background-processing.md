## What to build

Setup Celery worker with Redis. Enqueue a notification task when a work order is assigned. Implement retry backoff and mock provider logic.

## Acceptance criteria

- [ ] Celery worker runs independently from the API process in Docker Compose.
- [ ] Temporary provider failures are retried with exponential backoff.
- [ ] Permanent provider failures stop retrying and are logged.
- [ ] Task execution updates the DB with attempts and the final outcome.
- [ ] Duplicate notifications are prevented.

## Blocked by

- docs/issues/03-scheduling-concurrency.md
