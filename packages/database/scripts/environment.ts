import { config } from 'dotenv';
import { resolve } from 'node:path';

export function loadDevelopmentEnvironment(): void {
  config({ path: resolve(__dirname, '../../../apps/api/.env'), quiet: true });
}

export function requireDatabaseUrl(value: string | undefined): string {
  try {
    if (!value) throw new Error();
    const url = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length <= 1
    )
      throw new Error();
    return value;
  } catch {
    throw new Error(
      'A valid PostgreSQL connection URL with a host and database name is required',
    );
  }
}
