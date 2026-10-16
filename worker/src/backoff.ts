/**
 * Exponential backoff with "equal jitter": half the delay is fixed, half is
 * random, so retries from many failed jobs do not hit the provider in
 * lock-step. attemptsMade starts at 1 for the first retry.
 *   base=1s: ~1s, ~2s, ~4s, ~8s ... capped at 5 minutes.
 */
export function backoffDelay(attemptsMade: number, baseMs: number, maxMs = 300_000, random = Math.random): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attemptsMade - 1));
  return Math.round(exp / 2 + random() * (exp / 2));
}
