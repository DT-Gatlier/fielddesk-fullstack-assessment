import { normalizeEmail } from '@fielddesk/database';

export function normalizeEmailInput(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  if (!value.trim()) {
    return '';
  }
  return normalizeEmail(value);
}
