import argon2 from "argon2";
import pg from "pg";
import { loadConfig } from "../src/config.js";

type SeedUser = {
  email: string;
  role: "owner" | "dispatcher" | "technician";
};

type SeedOrg = {
  name: string;
  users: SeedUser[];
};

const SEED_ORGS: SeedOrg[] = [
  {
    name: "Acme Maintenance",
    users: [
      { email: "owner@acme.test", role: "owner" },
      { email: "dispatcher@acme.test", role: "dispatcher" },
      { email: "tech@acme.test", role: "technician" },
    ],
  },
  {
    name: "Beta Field Services",
    users: [
      { email: "owner@beta.test", role: "owner" },
      { email: "dispatcher@beta.test", role: "dispatcher" },
      { email: "tech@beta.test", role: "technician" },
    ],
  },
];

async function main(): Promise<void> {
  const config = loadConfig();
  const passwordHash = await argon2.hash(config.SEED_PASSWORD);

  const client = new pg.Client({ connectionString: config.DATABASE_URL });
  await client.connect();

  try {
    for (const org of SEED_ORGS) {
      const existing = await client.query<{ id: string }>(
        "SELECT id FROM organisations WHERE name = $1",
        [org.name],
      );

      let organisationId: string;

      if (existing.rowCount && existing.rowCount > 0) {
        organisationId = existing.rows[0].id;
        console.log(`Organisation already exists: ${org.name}`);
      } else {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO organisations (name)
           VALUES ($1)
           RETURNING id`,
          [org.name],
        );
        organisationId = inserted.rows[0].id;
        console.log(`Created organisation: ${org.name}`);
      }

      for (const user of org.users) {
        const result = await client.query(
          `INSERT INTO users (organisation_id, email, password_hash, role)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (organisation_id, email) DO NOTHING`,
          [organisationId, user.email, passwordHash, user.role],
        );

        if (result.rowCount && result.rowCount > 0) {
          console.log(`  Seeded user: ${user.email} (${user.role})`);
        } else {
          console.log(`  User already exists: ${user.email}`);
        }
      }
    }

    console.log("Seed complete.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
