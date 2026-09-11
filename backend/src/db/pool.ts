import pg from "pg";
import type { Env } from "../config.js";

let pool: pg.Pool | null = null;

export function getPool(config: Env): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function checkDatabase(config: Env): Promise<void> {
  const client = await getPool(config).connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}
