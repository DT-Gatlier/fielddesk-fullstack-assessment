import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hash, verify } from 'argon2';
import { createDatabaseClient, UserRole } from '../src';
import {
  seedDatabase,
  SAMPLE_PASSWORD,
  seedOrganisations,
} from '../prisma/seed-data';
import { assertSafeTestDatabase } from '../scripts/test-safety';

const url = assertSafeTestDatabase(
  process.env.TEST_DATABASE_URL,
  process.env.DEVELOPMENT_DATABASE_URL,
);
const client = createDatabaseClient(url);
before(async () => {
  await client.$connect();
  // Never silently erase pre-existing data. Use the explicit reset command first.
  assert.equal(
    await client.organisation.count(),
    0,
    'Integration tests require an empty test database; run db:test:reset first',
  );
});
after(async () => {
  await client.$disconnect();
});

void test('fresh migrations and repeated seeds produce two organisations and ten users', async () => {
  await seedDatabase(client);
  await seedDatabase(client);
  assert.equal(await client.organisation.count(), 2);
  assert.equal(await client.user.count(), 10);
  for (const fixture of seedOrganisations) {
    const organisation = await client.organisation.findUniqueOrThrow({
      where: { slug: fixture.slug },
    });
    assert.equal(organisation.name, fixture.name);
    const users = await client.user.findMany({
      where: { organisationId: organisation.id },
    });
    assert.equal(
      users.filter((user) => user.role === UserRole.OWNER).length,
      1,
    );
    assert.equal(
      users.filter((user) => user.role === UserRole.DISPATCHER).length,
      1,
    );
    assert.equal(
      users.filter((user) => user.role === UserRole.TECHNICIAN).length,
      3,
    );
    for (const expected of fixture.users) {
      const actual = users.find((user) => user.email === expected.email);
      assert.ok(actual);
      assert.equal(actual.name, expected.name);
      assert.equal(actual.role, expected.role);
    }
  }
  for (const user of await client.user.findMany()) {
    assert.match(user.passwordHash, /^\$argon2id\$/);
    assert.ok(await verify(user.passwordHash, SAMPLE_PASSWORD));
  }
});

void test('seeds preserve edited names, roles, passwords and extra records', async () => {
  const email = 'arjun.nair@clearbrook.org';
  const original = await client.user.findUniqueOrThrow({ where: { email } });
  const originalOrganisation = await client.organisation.findUniqueOrThrow({
    where: { id: original.organisationId },
  });
  const editedHash = await hash('ChangedPassword!');
  const user = await client.user.update({
    where: { email },
    data: {
      name: 'Edited user',
      role: UserRole.TECHNICIAN,
      passwordHash: editedHash,
    },
  });
  await client.organisation.update({
    where: { id: user.organisationId },
    data: { name: 'Edited organisation' },
  });
  const extra = await client.organisation.create({
    data: { slug: 'extra', name: 'Extra organisation' },
  });
  await client.user.create({
    data: {
      organisationId: extra.id,
      email: 'extra@fielddesk.example',
      name: 'Extra user',
      role: UserRole.OWNER,
      passwordHash: editedHash,
    },
  });
  await seedDatabase(client);
  const preserved = await client.user.findUniqueOrThrow({ where: { email } });
  assert.equal(preserved.name, 'Edited user');
  assert.equal(preserved.role, UserRole.TECHNICIAN);
  assert.equal(preserved.passwordHash, editedHash);
  assert.equal(
    (
      await client.organisation.findUniqueOrThrow({
        where: { id: user.organisationId },
      })
    ).name,
    'Edited organisation',
  );
  assert.equal(await client.organisation.count(), 3);
  assert.equal(await client.user.count(), 11);
  // Leave the seeded login credentials and roles intact for subsequent API tests.
  await client.user.update({
    where: { id: original.id },
    data: {
      name: original.name,
      role: original.role,
      passwordHash: original.passwordHash,
    },
  });
  await client.organisation.update({
    where: { id: originalOrganisation.id },
    data: { name: originalOrganisation.name },
  });
});

void test('database enforces global email uniqueness, slug uniqueness and tenant references', async () => {
  const user = await client.user.findFirstOrThrow();
  const data = {
    email: user.email,
    name: user.name,
    passwordHash: user.passwordHash,
    role: user.role,
    organisationId: user.organisationId,
  };
  await assert.rejects(client.user.create({ data }));
  await assert.rejects(
    client.organisation.create({ data: { slug: 'extra', name: 'Duplicate' } }),
  );
  await assert.rejects(
    client.user.create({
      data: {
        ...data,
        email: 'orphan@fielddesk.example',
        organisationId: randomUUID(),
      },
    }),
  );
  await assert.rejects(
    client.organisation.delete({ where: { id: user.organisationId } }),
  );
  const key = await client.$queryRaw<
    { count: bigint }[]
  >`SELECT count(*) FROM pg_indexes WHERE tablename = 'User' AND indexname = 'User_organisationId_id_key'`;
  assert.equal(Number(key[0].count), 1);
});

void test('raw writes cannot bypass normalized nonempty email or role constraints', async () => {
  const user = await client.user.findFirstOrThrow();
  for (const invalidEmail of [
    '',
    'UPPER@EXAMPLE.COM',
    ' whitespace@example.com ',
  ]) {
    await assert.rejects(
      client.$executeRaw`UPDATE "User" SET email = ${invalidEmail} WHERE id = ${user.id}::uuid`,
    );
  }
  await assert.rejects(
    client.$executeRaw`UPDATE "User" SET role = 'INVALID' WHERE id = ${user.id}::uuid`,
  );
});

void test('failed transactions leave no partial records', async () => {
  await assert.rejects(
    client.$transaction(async (transaction) => {
      await transaction.organisation.create({
        data: { slug: 'rollback-check', name: 'Rollback' },
      });
      throw new Error('Deliberate rollback');
    }),
  );
  assert.equal(
    await client.organisation.count({ where: { slug: 'rollback-check' } }),
    0,
  );
});
