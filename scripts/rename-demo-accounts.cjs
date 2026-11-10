require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const organisations = [
  {
    oldSlug: 'northstar-maintenance',
    slug: 'sree-lakshmi-services',
    name: 'Sree Lakshmi Services',
    oldDomain: 'northstar',
    domain: 'lakshmi',
    users: [['owner', 'Aiswarya'], ['dispatcher', 'Raju'], ['tech', 'Kamal']],
  },
  {
    oldSlug: 'brightline-facilities',
    slug: 'sri-sai-facilities',
    name: 'Sri Sai Facilities',
    oldDomain: 'brightline',
    domain: 'srisai',
    users: [['owner', 'Priya'], ['dispatcher', 'Arun'], ['tech', 'Suresh']],
  },
];

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Only local development databases are supported.');
  }

  await prisma.$transaction(async tx => {
    for (const entry of organisations) {
      const organisation = await tx.organisation.findFirstOrThrow({
        where: { slug: { in: [entry.oldSlug, entry.slug] } },
      });
      await tx.organisation.update({
        where: { id: organisation.id },
        data: { slug: entry.slug, name: entry.name },
      });
      for (const [oldRole, name] of entry.users) {
        const email = `${name.toLowerCase()}@${entry.domain}.test`;
        const user = await tx.user.findFirstOrThrow({
          where: {
            organisationId: organisation.id,
            email: { in: [`${oldRole}@${entry.oldDomain}.test`, email] },
          },
        });
        await tx.user.update({ where: { id: user.id }, data: { name, email } });
      }
    }
  });

  console.log(await prisma.user.findMany({
    select: { name: true, email: true, role: true, organisation: { select: { name: true } } },
    orderBy: { email: 'asc' },
  }));
  console.log('Business records:', {
    customers: await prisma.customer.count(),
    jobs: await prisma.job.count(),
  });
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
