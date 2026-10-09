import { QueryClient } from '@tanstack/react-query';
import { expect, it } from 'vitest';
import { clearAuthState, clearPrivateState } from './session-cache';
import { authKeys } from './auth-keys';

it('clears private records and mutation variables while keeping confirmed unauthenticated state', async () => {
  const client = new QueryClient();
  client.setQueryData(authKeys.session, null);
  client.setQueryData(
    ['work-orders', 'previous-org', 'previous-user'],
    [{ title: 'Private job' }],
  );
  const mutation = client
    .getMutationCache()
    .build(client, { mutationFn: async () => 'ok' });
  await mutation.execute({ password: 'sensitive' });
  await clearPrivateState(client);
  expect(client.getQueryData(authKeys.session)).toBeNull();
  expect(client.getQueryCache().getAll()).toHaveLength(1);
  expect(client.getMutationCache().getAll()).toHaveLength(0);
  client.clear();
});

it('a late private response cannot repopulate cache after an account change', async () => {
  const client = new QueryClient();
  let resolve: (value: string) => void = () => {};
  const key = ['work-orders', 'previous-org', 'previous-user'];
  const pending = client
    .fetchQuery({
      queryKey: key,
      queryFn: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    })
    .catch(() => undefined);
  await clearAuthState(client);
  resolve('Previous private data');
  await pending;
  expect(client.getQueryData(key)).toBeUndefined();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});

it('confirmed expiry cancels an overlapping identity read without becoming unavailable', async () => {
  const client = new QueryClient();
  client.setQueryData(authKeys.session, null);
  let resolve: (value: { name: string }) => void = () => {};
  const pending = client
    .fetchQuery({
      queryKey: authKeys.session,
      queryFn: () =>
        new Promise<{ name: string }>((done) => {
          resolve = done;
        }),
    })
    .catch(() => undefined);
  await clearPrivateState(client);
  resolve({ name: 'Previous identity' });
  await pending;
  expect(client.getQueryData(authKeys.session)).toBeNull();
  expect(client.getQueryState(authKeys.session)?.error).toBeNull();
  expect(client.getQueryState(authKeys.session)?.fetchStatus).toBe('idle');
  client.clear();
});
