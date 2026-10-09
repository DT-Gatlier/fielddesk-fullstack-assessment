import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export const CONNECTION_TIMEOUT_MS = 5000;
export const MAX_POOL_CONNECTIONS = 5;

export function createDatabaseClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    max: MAX_POOL_CONNECTIONS,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
  });
  return new PrismaClient({ adapter });
}
