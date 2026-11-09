import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from './config.js';
import { logger } from './logger.js';

let pool: Pool | null = null;
let useMock = false;

export function getDbPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      logger.error({ err: err.message }, 'Unexpected database pool error');
    });
  }
  return pool;
}

// In-memory mock database state for testing or when PG server is unreachable
interface MockOrg {
  id: string;
  name: string;
  storage_quota_bytes: number;
}

interface MockUser {
  id: string;
  organisation_id: string;
  email: string;
  password_hash: string;
  name: string;
  role: 'owner' | 'dispatcher' | 'technician';
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface MockRefreshToken {
  id: string;
  user_id: string;
  organisation_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

const mockOrgs: MockOrg[] = [
  { id: 'org-apex-01', name: 'Apex Facilities Management', storage_quota_bytes: 524288000 },
  { id: 'org-summit-02', name: 'Summit Infrastructure Services', storage_quota_bytes: 524288000 },
];

const BCRYPT_HASH_PASSWORD123 = '$2a$10$TYFU.YlSE1NfhIGQLroLhOPcyzuvqX9R9Yd1KQEL1LB6ejnMWqh.C';

const mockUsers: MockUser[] = [
  {
    id: '11111111-1111-1111-1111-111111111101',
    organisation_id: 'org-apex-01',
    email: 'owner@apex.test',
    password_hash: BCRYPT_HASH_PASSWORD123,
    name: 'Alice Owner (Apex)',
    role: 'owner',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: '11111111-1111-1111-1111-111111111102',
    organisation_id: 'org-apex-01',
    email: 'dispatcher@apex.test',
    password_hash: BCRYPT_HASH_PASSWORD123,
    name: 'David Dispatcher (Apex)',
    role: 'dispatcher',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: '11111111-1111-1111-1111-111111111103',
    organisation_id: 'org-apex-01',
    email: 'technician@apex.test',
    password_hash: BCRYPT_HASH_PASSWORD123,
    name: 'Tom Technician (Apex)',
    role: 'technician',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: '11111111-1111-1111-1111-111111111104',
    organisation_id: 'org-apex-01',
    email: 'technician2@apex.test',
    password_hash: BCRYPT_HASH_PASSWORD123,
    name: 'Tina Technician (Apex)',
    role: 'technician',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: '22222222-2222-2222-2222-222222222201',
    organisation_id: 'org-summit-02',
    email: 'owner@summit.test',
    password_hash: BCRYPT_HASH_PASSWORD123,
    name: 'Sam Owner (Summit)',
    role: 'owner',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: '22222222-2222-2222-2222-222222222202',
    organisation_id: 'org-summit-02',
    email: 'dispatcher@summit.test',
    password_hash: BCRYPT_HASH_PASSWORD123,
    name: 'Diana Dispatcher (Summit)',
    role: 'dispatcher',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: '22222222-2222-2222-2222-222222222203',
    organisation_id: 'org-summit-02',
    email: 'technician@summit.test',
    password_hash: BCRYPT_HASH_PASSWORD123,
    name: 'Terry Technician (Summit)',
    role: 'technician',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  },
];

const mockRefreshTokens: MockRefreshToken[] = [];

export function setUseMockDb(val: boolean) {
  useMock = val;
}

export async function query<R extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<R>> {
  if (!useMock) {
    try {
      const p = getDbPool();
      return await p.query<R>(text, params);
    } catch (err: any) {
      if (err.code === 'ECONNREFUSED' || config.NODE_ENV === 'test') {
        logger.warn('PostgreSQL unreachable or test mode, using in-memory database mock');
        useMock = true;
      } else {
        throw err;
      }
    }
  }

  // Execute in-memory query handler
  return executeMockQuery<R>(text, params);
}

function executeMockQuery<R extends QueryResultRow = any>(
  text: string,
  params: any[] = []
): QueryResult<R> {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();

  // Find user by email
  if (normalized.includes('from users u') && normalized.includes('where lower(u.email) = lower($1)')) {
    const email = params[0]?.toLowerCase();
    const user = mockUsers.find((u) => u.email.toLowerCase() === email);
    if (!user) {
      return { rows: [] as R[], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    }
    const org = mockOrgs.find((o) => o.id === user.organisation_id);
    const row = {
      ...user,
      organisation_name: org?.name ?? '',
    };
    return { rows: [row as unknown as R], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
  }

  // Find user by id and org
  if (normalized.includes('where u.id = $1 and u.organisation_id = $2')) {
    const id = params[0];
    const orgId = params[1];
    const user = mockUsers.find((u) => u.id === id && u.organisation_id === orgId);
    if (!user) {
      return { rows: [] as R[], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    }
    const org = mockOrgs.find((o) => o.id === user.organisation_id);
    const row = {
      ...user,
      organisation_name: org?.name ?? '',
    };
    return { rows: [row as unknown as R], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
  }

  // Insert refresh token
  if (normalized.includes('insert into refresh_tokens')) {
    const [userId, orgId, tokenHash, expiresAt] = params;
    const token: MockRefreshToken = {
      id: `rt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      user_id: userId,
      organisation_id: orgId,
      token_hash: tokenHash,
      expires_at: new Date(expiresAt),
      revoked_at: null,
      created_at: new Date(),
    };
    mockRefreshTokens.push(token);
    return { rows: [token as unknown as R], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
  }

  // Find active refresh token by hash
  if (normalized.includes('from refresh_tokens') && normalized.includes('token_hash = $1')) {
    const tokenHash = params[0];
    const token = mockRefreshTokens.find((t) => t.token_hash === tokenHash && !t.revoked_at && t.expires_at > new Date());
    if (!token) {
      return { rows: [] as R[], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    }
    return { rows: [token as unknown as R], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
  }

  // Revoke refresh token by id
  if (normalized.includes('update refresh_tokens set revoked_at = now() where id = $1')) {
    const id = params[0];
    const token = mockRefreshTokens.find((t) => t.id === id);
    if (token) {
      token.revoked_at = new Date();
      return { rows: [token as unknown as R], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] };
    }
    return { rows: [] as R[], rowCount: 0, command: 'UPDATE', oid: 0, fields: [] };
  }

  // Revoke all refresh tokens for a user
  if (normalized.includes('update refresh_tokens set revoked_at = now() where user_id = $1')) {
    const userId = params[0];
    let count = 0;
    for (const token of mockRefreshTokens) {
      if (token.user_id === userId && !token.revoked_at) {
        token.revoked_at = new Date();
        count++;
      }
    }
    return { rows: [] as R[], rowCount: count, command: 'UPDATE', oid: 0, fields: [] };
  }

  return { rows: [] as R[], rowCount: 0, command: 'UNKNOWN', oid: 0, fields: [] };
}

export async function withTransaction<T>(fn: (client: PoolClient | null) => Promise<T>): Promise<T> {
  if (useMock) {
    return fn(null);
  }

  const p = getDbPool();
  let client: PoolClient;
  try {
    client = await p.connect();
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED' || config.NODE_ENV === 'test') {
      useMock = true;
      return fn(null);
    }
    throw err;
  }

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
