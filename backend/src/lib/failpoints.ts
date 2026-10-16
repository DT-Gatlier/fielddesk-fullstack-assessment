/**
 * Test-only fault injection. Lets the test suite force a failure at a precise
 * point inside a transaction to prove that nothing partial is committed.
 * Inert outside NODE_ENV=test.
 */
const active = new Set<string>();

export function enableFailpoint(name: string) {
  if (process.env.NODE_ENV !== 'test') throw new Error('failpoints are only available in tests');
  active.add(name);
}
export function disableAllFailpoints() {
  active.clear();
}
export function failpoint(name: string) {
  if (process.env.NODE_ENV === 'test' && active.has(name)) {
    throw new Error(`failpoint triggered: ${name}`);
  }
}
