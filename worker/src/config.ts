export const workerConfig = {
  pollIntervalMs: Number(
    process.env.WORKER_POLL_INTERVAL_MS || 2000,
  ),

  batchSize: Number(
    process.env.WORKER_BATCH_SIZE || 10,
  ),

  maxAttempts: Number(
    process.env.WORKER_MAX_ATTEMPTS || 3,
  ),
};