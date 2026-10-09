export interface BackoffOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterFactor?: number;
}

/**
 * Calculates exponential backoff with full jitter to avoid the thundering herd problem.
 * Formula: min(maxDelay, baseDelay * 2^attempt) + jitter
 */
export function calculateExponentialBackoff(
  attemptNumber: number,
  options?: BackoffOptions,
): { delayMs: number; nextAttemptAt: Date } {
  const baseDelay = options?.baseDelayMs ?? 1000; // 1s default
  const maxDelay = options?.maxDelayMs ?? 60000; // 60s max
  const jitterFactor = options?.jitterFactor ?? 0.2; // +/- 20%

  const exponential = baseDelay * Math.pow(2, Math.max(0, attemptNumber));
  const capped = Math.min(maxDelay, exponential);

  // Full random jitter within +/- jitterFactor
  const jitter = capped * jitterFactor * (Math.random() * 2 - 1);
  const finalDelayMs = Math.max(baseDelay, Math.round(capped + jitter));

  return {
    delayMs: finalDelayMs,
    nextAttemptAt: new Date(Date.now() + finalDelayMs),
  };
}
