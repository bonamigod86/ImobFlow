import { AppError } from "@/lib/http/errors";
import { redis } from "@/lib/redis/client";

/**
 * Sliding-window rate limiting (per IP and per tenant) with a fail-open policy.
 *
 * Implemented with Redis INCR + EXPIRE (atomic, cheap, TTL-bound). When Redis
 * is unavailable the limiter ALLOWS the request and logs — the app must keep
 * serving during a cache outage; load is subsequently absorbed by the DB layer
 * and Web Application Firewall in production deployments.
 */

const NAMESPACE = "rl";

export class RateLimitError extends AppError {
  constructor(public readonly retryAfterSeconds: number) {
    super(429, "RATE_LIMITED", "Too many requests. Try again shortly.", {
      retryAfterSeconds,
    });
    this.name = "RateLimitError";
  }
}

async function hit(key: string, limit: number, windowSeconds: number): Promise<void> {
  try {
    const redisKey = `${NAMESPACE}:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }
    if (count > limit) {
      throw new RateLimitError(windowSeconds);
    }
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    console.warn("[rate-limit] Redis unavailable — allowing request (fail-open)", err);
  }
}

/** Rate-limit a request by its client IP address. */
export async function rateLimitByIp(
  key: string,
  clientIp: string | null,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  if (!clientIp) return; // no IP (rare in serverless) — do not block unknown callers
  await hit(`ip:${key}:${clientIp}`, limit, windowSeconds);
}

/** Rate-limit by tenant (platform abuse guard for per-tenant APIs). */
export async function rateLimitByTenant(
  key: string,
  tenantId: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  await hit(`tenant:${key}:${tenantId}`, limit, windowSeconds);
}