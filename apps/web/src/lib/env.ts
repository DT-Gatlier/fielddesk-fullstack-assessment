export function validateApiUrl(value: string | undefined): string {
  if (!value) {
    throw new Error('Set NEXT_PUBLIC_API_URL in apps/web/.env.local');
  }
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('NEXT_PUBLIC_API_URL must be an HTTP(S) origin');
  }
  return url.origin;
}

export function getApiUrl(): string {
  return validateApiUrl(process.env.NEXT_PUBLIC_API_URL);
}
