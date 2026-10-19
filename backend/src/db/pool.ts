import pg from 'pg';

// Return BIGINT columns (storage byte counts, audit ids) as numbers. Values stay far below 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number.parseInt(value, 10));

export type Pool = pg.Pool;
export type DbClient = pg.PoolClient;

export function createPool(connectionString: string, max = 10): pg.Pool {
  return new pg.Pool({ connectionString, max });
}

/**
 * Runs `fn` inside a single transaction. Commits if it resolves, rolls back if it throws.
 *
 * When `orgId` is given, the transaction-local setting `app.org_id` is set so that row-level
 * security limits every statement to that organisation. `set_config(..., true)` is scoped to the
 * transaction, so a pooled connection never carries one tenant's scope into another request.
 */
export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: DbClient) => Promise<T>,
  options: { orgId?: string } = {},
): Promise<T> {
  const client = await pool.connect();
  let releaseError: Error | undefined;
  try {
    await client.query('BEGIN');
    if (options.orgId) {
      await client.query("SELECT set_config('app.org_id', $1, true)", [options.orgId]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // The connection is in an unknown state; destroy it instead of returning it to the pool.
      releaseError = rollbackError as Error;
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
}

/** Shorthand for a transaction scoped to one organisation. */
export function withOrg<T>(pool: pg.Pool, orgId: string, fn: (client: DbClient) => Promise<T>): Promise<T> {
  return withTransaction(pool, fn, { orgId });
}
