export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error('Email must not be empty');
  return normalized;
}
