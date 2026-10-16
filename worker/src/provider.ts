/**
 * Contract for an external notification provider (e-mail/SMS/push).
 * Implementations must classify failures so the worker knows whether a retry
 * can help.
 */
export interface OutboundMessage {
  /** Sent to the provider so it can drop a repeat of the same logical message. */
  idempotencyKey: string;
  to: string;
  subject: string;
  body: string;
}

export interface SendResult {
  messageId: string;
  /** True when the provider recognised the idempotency key and did not send again. */
  duplicate: boolean;
}

export interface NotificationProvider {
  send(msg: OutboundMessage, signal: AbortSignal): Promise<SendResult>;
}

/** Retrying may succeed: timeouts, 5xx, 429, network errors. */
export class TemporaryProviderError extends Error {
  override readonly name = 'TemporaryProviderError';
}

/** Retrying cannot succeed: invalid recipient, rejected content, 4xx. */
export class PermanentProviderError extends Error {
  override readonly name = 'PermanentProviderError';
}
