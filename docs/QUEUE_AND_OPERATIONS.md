# Queue, caching, and operations

## Durable asynchronous assignment flow

1. A work-order create/update transaction writes the work order, audit entry, and a unique `notification_jobs` outbox row.
2. The API responds after commit; it does not wait for the external provider.
3. The independent worker polls ready outbox rows and enqueues BullMQ jobs in Redis using the PostgreSQL job UUID as BullMQ `jobId`.
4. BullMQ leases the job to one worker using Redis locks. Worker concurrency is 10 per process.
5. The provider result and audit outcome are committed to PostgreSQL.

The outbox closes the database/queue dual-write gap. If Redis is down, rows remain pending. If the dispatcher crashes between enqueue and marking `processing`, the deterministic BullMQ job ID deduplicates redispatch. Processing rows older than five minutes are recovered. PostgreSQL delivery state is checked before provider invocation, so already delivered jobs are skipped.

Temporary errors use BullMQ exponential backoff and a configurable attempt limit. Permanent provider errors use `UnrecoverableError` and stop immediately. Every attempt is recorded. `MOCK_NOTIFICATION_MODE` controls behaviour:

- `success`: succeeds immediately
- `temporary_failure`: fails until attempts are exhausted
- `permanent_failure`: stops after the first attempt
- `flaky`: fails twice, then succeeds

This provides at-least-once job execution. The deterministic job ID and persisted delivered status avoid duplicate notifications during normal retries. A real provider should additionally receive `deduplication_key` as its idempotency key because a process can crash after the provider accepts a message but before PostgreSQL records delivery.

## Redis use

Redis is used for:

- BullMQ delayed retries, job leases, concurrency, and deduplication
- short-lived dashboard caching
- organisation cache-version counters
- cross-instance SSE Pub/Sub

Redis is not used to enforce scheduling or progress-event correctness. Those invariants use PostgreSQL constraints, row locks, unique keys, and transactions. A Redis distributed lock would add expiry/failover edge cases and would not protect direct database writers.

## Processes

- API: `npm run dev` or built `npm start -w backend`
- Worker: `npm run worker:dev -w backend` or built `npm run worker -w backend`
- Migration: `npm run db:migrate`
- Seed: `npm run db:seed`

`/health` is process liveness. `/ready` checks PostgreSQL and Redis and returns `503 degraded` if Redis is unavailable. The API can still serve core database operations while degraded; background notification, cache, and cross-instance real-time delivery recover after Redis and worker restart.

## Scaling and deployment

Run stateless API replicas behind a load balancer and worker replicas separately. PostgreSQL constraints remain shared authority, BullMQ coordinates job ownership, and Redis Pub/Sub fans events to SSE clients connected to any API replica. Use managed PostgreSQL with point-in-time recovery, managed Redis with persistence appropriate to queue durability, and private object storage instead of the local upload directory.

Monitor request latency/error rate, PostgreSQL pool saturation/locks, outbox age, BullMQ waiting/failed/stalled counts, provider result rates, Redis memory/evictions, SSE connection count, storage quota, and worker shutdowns. Alert on old pending/processing outbox rows and permanent failures.

Back up PostgreSQL with encrypted full backups plus WAL/PITR and regularly test restoration. Enable object-store versioning/lifecycle and reconcile attachment metadata with stored objects. Redis cache and Pub/Sub data are disposable; queued work can be reconstructed from the PostgreSQL outbox.
