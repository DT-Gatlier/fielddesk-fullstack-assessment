import { expect, it } from 'vitest';
import { validateApiUrl } from './env';
it('accepts origins and rejects credentials, paths and missing configuration', () => {
  expect(validateApiUrl('http://localhost:3001')).toBe('http://localhost:3001');
  for (const url of [
    undefined,
    'ftp://localhost',
    'https://user:secret@host',
    'https://host/api',
    'https://host?key=secret',
  ]) {
    expect(() => validateApiUrl(url)).toThrow();
  }
});
