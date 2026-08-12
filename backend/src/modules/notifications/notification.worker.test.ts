import { describe, expect, it } from 'vitest';
import { mockNotify, PermanentProviderError, TemporaryProviderError } from './notification.worker.js';

describe('mock notification provider', () => {
  it('supports successful delivery', async () => { await expect(mockNotify('success', 1)).resolves.toBeUndefined(); });
  it('classifies permanent failures', async () => { await expect(mockNotify('permanent_failure', 1)).rejects.toBeInstanceOf(PermanentProviderError); });
  it('allows controllable transient recovery', async () => {
    await expect(mockNotify('flaky', 1)).rejects.toBeInstanceOf(TemporaryProviderError);
    await expect(mockNotify('flaky', 3)).resolves.toBeUndefined();
  });
});
