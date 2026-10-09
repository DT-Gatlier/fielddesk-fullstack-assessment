import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './return-path';

describe('return paths', () => {
  it.each([
    null,
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/%2f%2fevil.example',
    '/%5cevil.example',
    '/login',
    '/',
    '/dashboard\n',
  ])('rejects unsafe or looping destination %s', (value) => {
    expect(safeReturnPath(value)).toBe('/dashboard');
  });
  it('preserves internal parameters', () => {
    expect(safeReturnPath('/dashboard?view=assigned#activity')).toBe(
      '/dashboard?view=assigned#activity',
    );
  });
});
