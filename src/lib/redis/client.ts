import IORedis from "ioredis";
import { env } from "@/lib/config/env";

const globalForRedis = globalThis as unknown as {
  redis: IORedis | undefined;
  redisBull: IORedis | undefined;
};

/**
 * Application cache client.
 * `maxRetriesPerRequest: 1` + `enableOfflineQueue: false` means the app fails
 * fast when Redis is down instead of buffering requests forever.
 */
export const redis =
  globalForRedis.redis ??
  new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    enableReadyCheck: true,
    lazyConnect: false,
  });

/**
 * BullMQ requires `maxRetriesPerRequest: null` (it implements its own retry
 * semantics around blocking commands) — a dedicated connection avoids
 * clashing timeouts with the cache client.
 */
export const redisBull =
  globalForRedis.redisBull ??
  new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

if (env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
  globalForRedis.redisBull = redisBull;
}

// Node turns unhandled 'error' events into process crashes — ioredis emits them
// for connection-level failures (Redis briefly down, network blips). Log them.
redis.on("error", (err) => console.warn("[redis] cache client error", err.message));
redisBull.on("error", (err) => console.warn("[redis] bullmq client error", err.message));

export async function pingRedis(): Promise<boolean> {
  try {
    return (await redis.ping()) === "PONG";
  } catch {
    return false;
  }
}