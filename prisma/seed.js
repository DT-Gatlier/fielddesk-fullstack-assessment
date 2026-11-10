require('dotenv/config');

const bcrypt = require('bcryptjs');
const { PrismaClient, Role, JobStatus, JobPriority } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set before seeding.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const passwordHash = await bcrypt.hash('FieldDesk123!', 12);
  const organisations = [
    { slug: 'sree-lakshmi-services', name: 'Sree Lakshmi Services' },
    { slug: 'sri-sai-facilities', name: 'Sri Sai Facilities' },
  ];

  for (const [index, organisationData] of organisations.entries()) {
    const organisation = await prisma.organisation.upsert({
      where: { slug: organisationData.slug },
      update: { name: organisationData.name },
      create: organisationData,
    });
    const prefix = index === 0 ? 'lakshmi' : 'srisai';
    const names = index === 0
      ? { owner: 'Aiswarya', dispatcher: 'Raju', technician: 'Kamal' }
      : { owner: 'Priya', dispatcher: 'Arun', technician: 'Suresh' };
    const accounts = [
      { email: `${names.owner.toLowerCase()}@${prefix}.test`, name: names.owner, role: Role.OWNER },
      { email: `${names.dispatcher.toLowerCase()}@${prefix}.test`, name: names.dispatcher, role: Role.DISPATCHER },
      { email: `${names.technician.toLowerCase()}@${prefix}.test`, name: names.technician, role: Role.TECHNICIAN },
    ];
    const users = {};
    for (const account of accounts) {
      users[account.role] = await prisma.user.upsert({
        where: { email: account.email },
        update: {
          name: account.name,
          role: account.role,
          passwordHash,
          organisationId: organisation.id,
          isActive: true,
        },
        create: {
          ...account,
          passwordHash,
          organisationId: organisation.id,
        },
      });
    }

    const customer = await prisma.customer.upsert({
      where: { id: `seed-customer-${prefix}` },
      update: {
        name: `${organisation.name} Customer`,
        address: index === 0 ? '14 Market Street' : '22 River Road',
        phone: '+1-555-0100',
        organisationId: organisation.id,
      },
      create: {
        id: `seed-customer-${prefix}`,
        name: `${organisation.name} Customer`,
        address: index === 0 ? '14 Market Street' : '22 River Road',
        phone: '+1-555-0100',
        organisationId: organisation.id,
      },
    });
    const start = new Date(Date.now() + (index + 1) * 24 * 60 * 60 * 1000);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    await prisma.job.upsert({
      where: {
        organisationId_referenceNumber: {
          organisationId: organisation.id,
          referenceNumber: `FD-${index + 1}001`,
        },
      },
      update: {
        title: 'HVAC inspection',
        description: 'Inspect the rooftop cooling unit and report any faults.',
        technicianId: users[Role.TECHNICIAN].id,
        scheduledStart: start,
        scheduledEnd: end,
      },
      create: {
        organisationId: organisation.id,
        referenceNumber: `FD-${index + 1}001`,
        title: 'HVAC inspection',
        description: 'Inspect the rooftop cooling unit and report any faults.',
        status: JobStatus.ASSIGNED,
        priority: JobPriority.NORMAL,
        customerId: customer.id,
        technicianId: users[Role.TECHNICIAN].id,
        createdById: users[Role.DISPATCHER].id,
        scheduledStart: start,
        scheduledEnd: end,
        siteName: 'Main site',
      },
    });
  }

  console.log('Seed complete. All six demo accounts use password: FieldDesk123!');
}

main()
  .catch((error) => {
    console.error('Database seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
