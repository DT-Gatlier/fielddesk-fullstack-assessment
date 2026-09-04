## What to build

Setup Celery worker with Redis. Enqueue a notification task when a work order is assigned. Implement retry backoff and mock provider logic.

## Acceptance criteria

- [x] Celery worker runs independently from the API process in Docker Compose.
- [x] Temporary provider failures are retried with exponential backoff.
- [x] Permanent provider failures stop retrying and are logged.
- [x] Task execution updates the DB with attempts and the final outcome.
- [x] Duplicate notifications are prevented.

## Blocked by

- docs/issues/03-scheduling-concurrency.md
