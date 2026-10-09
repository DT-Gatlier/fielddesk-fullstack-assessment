import { expect, it } from 'vitest';
import { loginSchema } from './login.schema';

it('normalises email but preserves every password character', () => {
  expect(
    loginSchema.parse({
      email: ' Arjun.Nair@clearbrook.org ',
      password: ' secret ',
    }),
  ).toEqual({ email: 'arjun.nair@clearbrook.org', password: ' secret ' });
});
it('rejects missing, invalid and oversized values', () => {
  for (const values of [
    { email: 'invalid', password: 'valid' },
    { email: 'user@example.org', password: '' },
    { email: 'user@example.org', password: 'a'.repeat(129) },
    { email: `${'a'.repeat(254)}@example.org`, password: 'valid' },
  ])
    expect(loginSchema.safeParse(values).success).toBe(false);
});
