import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../config.js';
import { RedisRuntime } from './runtime.js';

const config = { REDIS_URL: 'redis://unused', CACHE_TTL_SECONDS: 30 } as Config;

describe('real-time tenant isolation', () => {
  it('delivers a local fallback event only to clients in the target organisation', async () => {
    const runtime = new RedisRuntime(config);
    const orgA = { write: vi.fn() } as unknown as Response;
    const orgB = { write: vi.fn() } as unknown as Response;
    runtime.attachEventStream('organisation-a', orgA);
    runtime.attachEventStream('organisation-b', orgB);
    await runtime.publish('organisation-a', 'work_order.updated', { id: 'work-order-a' });
    expect(orgA.write).toHaveBeenCalledWith(expect.stringContaining('work_order.updated'));
    expect(orgB.write).not.toHaveBeenCalled();
  });
});
