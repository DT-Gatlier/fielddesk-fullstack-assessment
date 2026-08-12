import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../../database/pool.js';
import { DynamicRepository } from './dynamic.repository.js';

describe('DynamicRepository tenant isolation', () => {
  it('always scopes a resource lookup by organisation', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'employee-id' }], rowCount: 1 });
    const repository = new DynamicRepository({ query } as unknown as Database, 'employees');
    await repository.find('organisation-a', 'employee-id', ['id', 'name']);
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE organisation_id = \$1 AND id = \$2/),
      ['organisation-a', 'employee-id']
    );
  });

  it('rejects unsafe table and column identifiers before executing SQL', async () => {
    const query = vi.fn();
    expect(() => new DynamicRepository({ query } as unknown as Database, 'users; DROP TABLE users')).toThrow('Unsafe SQL identifier');
    const repository = new DynamicRepository({ query } as unknown as Database, 'employees');
    await expect(repository.find('organisation-a', 'employee-id', ['password_hash AS password'])).rejects.toThrow('Unsafe SQL identifier');
    expect(query).not.toHaveBeenCalled();
  });
});
