import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import pg from "pg";
import { loadConfig } from "../src/config.js";

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

async function main(): Promise<void> {
  const config = loadConfig();
    const migrationsDir = config.MIGRATIONS_DIR.startsWith("/")
      ? config.MIGRATIONS_DIR
      : resolve(process.cwd(), config.MIGRATIONS_DIR);

  const client = new pg.Client({ connectionString: config.DATABASE_URL });
  await client.connect();

  try {
    await client.query(BOOTSTRAP_SQL);

    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const filename of files) {
      const applied = await client.query<{ filename: string }>(
        "SELECT filename FROM schema_migrations WHERE filename = $1",
        [filename],
      );

      if (applied.rowCount && applied.rowCount > 0) {
        console.log(`Skipping already applied migration: ${filename}`);
        continue;
      }

      const sql = await readFile(join(migrationsDir, filename), "utf8");
      console.log(`Applying migration: ${filename}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [filename],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log("Migrations complete.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
