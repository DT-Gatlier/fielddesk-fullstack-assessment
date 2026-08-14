import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  console.log("🌱 Starting database seed...");

  // Passwords are for assessment/testing only.
  const passwordHash = await bcrypt.hash("Password@123", 12);

  // --------------------------------------------------
  // Organisation A
  // --------------------------------------------------

  const organisationA = await prisma.organisation.upsert({
    where: {
      id: "org-a",
    },
    update: {},
    create: {
      id: "org-a",
      name: "Organisation A",
      storageLimitBytes: 100 * 1024 * 1024,
      storageUsedBytes: 0,
    },
  });

  // --------------------------------------------------
  // Organisation B
  // --------------------------------------------------

  const organisationB = await prisma.organisation.upsert({
    where: {
      id: "org-b",
    },
    update: {},
    create: {
      id: "org-b",
      name: "Organisation B",
      storageLimitBytes: 100 * 1024 * 1024,
      storageUsedBytes: 0,
    },
  });

  // --------------------------------------------------
  // Organisation A users
  // --------------------------------------------------

  await prisma.user.createMany({
    data: [
      {
        id: "user-a-owner",
        organisationId: organisationA.id,
        name: "Organisation A Owner",
        email: "owner.a@fielddesk.test",
        passwordHash,
        role: UserRole.OWNER,
      },
      {
        id: "user-a-dispatcher",
        organisationId: organisationA.id,
        name: "Organisation A Dispatcher",
        email: "dispatcher.a@fielddesk.test",
        passwordHash,
        role: UserRole.DISPATCHER,
      },
      {
        id: "user-a-technician",
        organisationId: organisationA.id,
        name: "Organisation A Technician",
        email: "technician.a@fielddesk.test",
        passwordHash,
        role: UserRole.TECHNICIAN,
      },
    ],
    skipDuplicates: true,
  });

  // --------------------------------------------------
  // Organisation B users
  // --------------------------------------------------

  await prisma.user.createMany({
    data: [
      {
        id: "user-b-owner",
        organisationId: organisationB.id,
        name: "Organisation B Owner",
        email: "owner.b@fielddesk.test",
        passwordHash,
        role: UserRole.OWNER,
      },
      {
        id: "user-b-dispatcher",
        organisationId: organisationB.id,
        name: "Organisation B Dispatcher",
        email: "dispatcher.b@fielddesk.test",
        passwordHash,
        role: UserRole.DISPATCHER,
      },
      {
        id: "user-b-technician",
        organisationId: organisationB.id,
        name: "Organisation B Technician",
        email: "technician.b@fielddesk.test",
        passwordHash,
        role: UserRole.TECHNICIAN,
      },
    ],
    skipDuplicates: true,
  });

  console.log("✅ Organisations created:");
  console.log(`   - ${organisationA.name}`);
  console.log(`   - ${organisationB.name}`);

  console.log("✅ Users created");

  console.log("");
  console.log("Assessment login password:");
  console.log("   Password@123");

  console.log("");
  console.log("Organisation A:");
  console.log("   owner.a@fielddesk.test");
  console.log("   dispatcher.a@fielddesk.test");
  console.log("   technician.a@fielddesk.test");

  console.log("");
  console.log("Organisation B:");
  console.log("   owner.b@fielddesk.test");
  console.log("   dispatcher.b@fielddesk.test");
  console.log("   technician.b@fielddesk.test");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });