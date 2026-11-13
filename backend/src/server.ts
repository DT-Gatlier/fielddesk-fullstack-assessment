import "dotenv/config";
import app from "./app";
import { ensureDatabaseSeeded } from "./database/seed";
import { prisma } from "./config/prisma";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters");
}

const PORT = Number(process.env.PORT) || 4000;

const server = app.listen(PORT, async () => {
  console.log(`FieldDesk API running on port ${PORT}`);
  await ensureDatabaseSeeded();
});

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
