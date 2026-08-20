import { redis } from "@/lib/redis/client";

const DEFAULT_TTL_SECONDS = 60;

/**
 * Low-level JSON cache helpers on top of ioredis.
 * Cache failures are SOFT: callers must fall back to the source of truth (DB)
 * — never use the cache as the authoritative store.
 */

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // cache is best-effort
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch {
    // best-effort
  }
}

export async function cacheGetRaw(key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}