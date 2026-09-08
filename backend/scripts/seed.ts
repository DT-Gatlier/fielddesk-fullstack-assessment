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

async function seedWorkOrders(
  client: pg.Client,
  orgName: string,
  organisationId: string,
): Promise<void> {
  const existing = await client.query(
    "SELECT 1 FROM work_orders WHERE organisation_id = $1 LIMIT 1",
    [organisationId],
  );
  if (existing.rowCount) {
    console.log(`  Work orders already exist for: ${orgName}`);
    return;
  }

  const users = await client.query<{ id: string; role: string; email: string }>(
    "SELECT id, role, email FROM users WHERE organisation_id = $1",
    [organisationId],
  );

  const dispatcher = users.rows.find((u) => u.role === "dispatcher");
  const technician = users.rows.find((u) => u.role === "technician");
  if (!dispatcher || !technician) {
    return;
  }

  const samples = [
    {
      reference: "WO-00001",
      title: "HVAC inspection",
      description: "Quarterly HVAC system inspection and filter replacement.",
      priority: "medium",
      status: "scheduled",
      site: "Main Office Building",
      assign: true,
    },
    {
      reference: "WO-00002",
      title: "Elevator maintenance",
      description: "Routine elevator safety check.",
      priority: "high",
      status: "draft",
      site: "Warehouse A",
      assign: false,
    },
    {
      reference: "WO-00003",
      title: "Lighting repair",
      description: "Replace faulty lighting in parking lot.",
      priority: "low",
      status: "in_progress",
      site: "Parking Lot B",
      assign: true,
    },
  ] as const;

  for (const sample of samples) {
    const scheduledStart = sample.assign
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : null;
    const scheduledEnd = sample.assign
      ? new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString()
      : null;

    await client.query(
      `INSERT INTO work_orders (
         organisation_id, created_by_user_id, assigned_technician_id,
         reference_number, title, description, priority, status,
         scheduled_start, scheduled_end, site_name
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        organisationId,
        dispatcher.id,
        sample.assign ? technician.id : null,
        sample.reference,
        sample.title,
        sample.description,
        sample.priority,
        sample.status,
        scheduledStart,
        scheduledEnd,
        sample.site,
      ],
    );
  }

  console.log(`  Seeded sample work orders for: ${orgName}`);
}

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

      await seedWorkOrders(client, org.name, organisationId);
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
