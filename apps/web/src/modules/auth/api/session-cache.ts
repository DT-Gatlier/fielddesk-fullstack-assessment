import type { QueryClient } from '@tanstack/react-query';
import { resetAuthTransport } from './auth-transport';
import { authKeys } from './auth-keys';

export async function clearAuthState(client: QueryClient): Promise<void> {
  resetAuthTransport();
  await client.cancelQueries();
  client.clear();
}

export async function clearPrivateState(client: QueryClient): Promise<void> {
  resetAuthTransport();
  const predicate = (query: { queryKey: readonly unknown[] }) =>
    query.queryKey[0] !== 'auth';
  // Rotating the transport epoch also invalidates an overlapping identity read.
  // Cancel it before preserving the authoritative anonymous result, so a focus
  // check cannot replace confirmed expiry with an obsolete-request error.
  await client.cancelQueries();
  client.removeQueries({ predicate });
  client.setQueryData(authKeys.session, null);
  client.getMutationCache().clear();
}
