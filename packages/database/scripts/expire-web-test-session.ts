import { createHash } from 'node:crypto';
import { createDatabaseClient } from '../src';

async function main(): Promise<void> {
  const raw = process.env.E2E_DATABASE_URL;
  const token = process.env.E2E_SESSION_TOKEN;
  if (!raw || !token || process.env.NODE_ENV === 'production')
    throw new Error('Explicit test configuration required');
  const url = new URL(raw);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    decodeURIComponent(url.pathname) !== '/fielddesk_web_test'
  )
    throw new Error('Dedicated web test database required');
  const client = createDatabaseClient(raw);
  try {
    await client.session.update({
      where: { tokenHash: createHash('sha256').update(token).digest('hex') },
      // Preserve the database invariant that expiry follows creation.
      data: {
        createdAt: new Date(Date.now() - 120000),
        expiresAt: new Date(Date.now() - 60000),
      },
    });
  } finally {
    await client.$disconnect();
  }
}
void main().catch(() => {
  console.error('Isolated session expiry fixture failed');
  process.exitCode = 1;
});
