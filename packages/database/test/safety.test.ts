import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeTestDatabase } from '../scripts/test-safety';
import { normalizeEmail } from '../src/email';

const development = 'postgresql://user:password@localhost:5432/fielddesk';
void test('normalizes emails and rejects empty input', () => {
  assert.equal(normalizeEmail(' Owner@Example.COM '), 'owner@example.com');
  assert.throws(() => normalizeEmail('   '));
});
void test('compares parsed host, port, and database, independent of credentials/protocol spelling', () => {
  assert.equal(
    assertSafeTestDatabase(
      'postgres://other:pass@127.0.0.1/fielddesk_test',
      development,
    ),
    'postgres://other:pass@127.0.0.1/fielddesk_test',
  );
});
void test('rejects missing, development, wrong-name, remote, and wrong-port targets', () => {
  for (const value of [
    undefined,
    development,
    'postgresql://localhost/fielddesk',
    'postgresql://remote/fielddesk_test',
    'postgresql://localhost:5555/fielddesk_test',
    'postgresql://localhost/fielddesk%5ftest/extra',
  ]) {
    assert.throws(() => assertSafeTestDatabase(value, development));
  }
  assert.throws(() =>
    assertSafeTestDatabase(
      'postgres://localhost/fielddesk_test',
      'postgresql://127.0.0.1:5432/fielddesk_test',
    ),
  );
});
