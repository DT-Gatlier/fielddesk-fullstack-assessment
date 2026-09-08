import { Redis } from "ioredis";
import type { Env } from "../config.js";

let redis: Redis | null = null;

export function getRedis(config: Env): Redis {
  if (!redis) {
    redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
  }
  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

export async function checkRedis(config: Env): Promise<void> {
  const client = getRedis(config);
  if (client.status !== "ready") {
    await client.connect();
  }
  const pong = await client.ping();
  if (pong !== "PONG") {
    throw new Error("Redis ping failed");
  }
}
