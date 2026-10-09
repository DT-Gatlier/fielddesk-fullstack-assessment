import createClient from 'openapi-fetch';
import type { paths } from './schema';
import { getApiUrl } from '@/lib/env';
import { responseError } from './error';

export function createApiClient() {
  const client = createClient<paths>({
    baseUrl: getApiUrl(),
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  client.use({
    async onResponse({ response }) {
      if (!response.ok) {
        let body: unknown;
        try {
          body = await response.clone().json();
        } catch {
          body = undefined;
        }
        const error = responseError(response, body);
        const path = new URL(response.url).pathname;
        if (
          response.status === 401 &&
          !path.startsWith('/api/v1/auth/') &&
          typeof window !== 'undefined'
        ) {
          window.dispatchEvent(new Event('fielddesk:unauthorized'));
        }
        throw error;
      }
    },
  });
  return client;
}

let client: ReturnType<typeof createApiClient> | undefined;
export function apiClient(): ReturnType<typeof createApiClient> {
  client ??= createApiClient();
  return client;
}
