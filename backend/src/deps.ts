import type { Redis } from 'ioredis';
import type { RealtimeHub } from './modules/realtime/hub';
import type { StorageProvider } from './modules/attachments/storage';

/** External resources the API depends on, injected so tests use real instances explicitly. */
export interface AppDeps {
  /** General-purpose Redis connection (rate limits, publishing real-time events). */
  redis: Redis;
  realtime: RealtimeHub;
  storage: StorageProvider;
}
