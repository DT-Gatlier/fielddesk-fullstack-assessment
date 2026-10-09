import { hash, argon2id } from 'argon2';
import { PrismaClient, UserRole, normalizeEmail } from '../src';

// Development-only fixtures. Not built or exported by the public package.
export const SAMPLE_PASSWORD = 'Demo2026';
export const seedOrganisations = [
  {
    slug: 'clearbrook-maintenance',
    name: 'Clearbrook Maintenance',
    users: [
      {
        name: 'Arjun Nair',
        email: 'arjun.nair@clearbrook.org',
        role: UserRole.OWNER,
      },
      {
        name: 'Meera Menon',
        email: 'meera.menon@clearbrook.org',
        role: UserRole.DISPATCHER,
      },
      {
        name: 'Rahul Sharma',
        email: 'rahul.sharma@clearbrook.org',
        role: UserRole.TECHNICIAN,
      },
      {
        name: 'Priya Patel',
        email: 'priya.patel@clearbrook.org',
        role: UserRole.TECHNICIAN,
      },
      {
        name: 'Kiran Rao',
        email: 'kiran.rao@clearbrook.org',
        role: UserRole.TECHNICIAN,
      },
    ],
  },
  {
    slug: 'oakridge-property-services',
    name: 'Oakridge Property Services',
    users: [
      {
        name: 'Ananya Iyer',
        email: 'ananya.iyer@oakridge.org',
        role: UserRole.OWNER,
      },
      {
        name: 'Vikram Singh',
        email: 'vikram.singh@oakridge.org',
        role: UserRole.DISPATCHER,
      },
      {
        name: 'Neha Gupta',
        email: 'neha.gupta@oakridge.org',
        role: UserRole.TECHNICIAN,
      },
      {
        name: 'Rohan Das',
        email: 'rohan.das@oakridge.org',
        role: UserRole.TECHNICIAN,
      },
      {
        name: 'Aditi Joshi',
        email: 'aditi.joshi@oakridge.org',
        role: UserRole.TECHNICIAN,
      },
    ],
  },
];

export async function seedDatabase(client: PrismaClient): Promise<void> {
  const passwordHash = await hash(SAMPLE_PASSWORD, {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  await client.$transaction(async (transaction) => {
    for (const fixture of seedOrganisations) {
      const organisation = await transaction.organisation.upsert({
        where: { slug: fixture.slug },
        update: {},
        create: { slug: fixture.slug, name: fixture.name },
      });
      for (const user of fixture.users) {
        const email = normalizeEmail(user.email);
        await transaction.user.upsert({
          where: { email },
          update: {},
          create: {
            email,
            name: user.name,
            passwordHash,
            role: user.role,
            organisationId: organisation.id,
          },
        });
      }
    }
  });
}
