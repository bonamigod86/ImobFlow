import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Rate limiter contract: Redis INCR window counting, TTL seeding on first hit,
 * 429 beyond the limit, and FAIL-OPEN when Redis is down.
 */

const redisMock = vi.hoisted(() => ({
  incr: vi.fn(),
  expire: vi.fn(),
}));

vi.mock("@/lib/redis/client", () => ({ redis: redisMock }));

import {
  rateLimitByIp,
  rateLimitByTenant,
  RateLimitError,
} from "@/lib/security/rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rateLimit", () => {
  it("allows requests within the limit and seeds the TTL on the first hit", async () => {
    redisMock.incr.mockResolvedValue(3);
    await expect(
      rateLimitByIp("auth-login", "1.2.3.4", 5, 60),
    ).resolves.toBeUndefined();
    expect(redisMock.incr).toHaveBeenCalledWith("rl:ip:auth-login:1.2.3.4");
    expect(redisMock.expire).not.toHaveBeenCalled(); // count > 1

    redisMock.incr.mockResolvedValue(1);
    await rateLimitByIp("auth-login", "1.2.3.4", 5, 60);
    expect(redisMock.expire).toHaveBeenCalledWith(expect.stringContaining("1.2.3.4"), 60);
  });

  it("rejects with 429 when the limit is exceeded", async () => {
    redisMock.incr.mockResolvedValue(11);
    await expect(rateLimitByIp("auth-login", "1.2.3.4", 10, 60)).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it("fails open when Redis errors", async () => {
    redisMock.incr.mockRejectedValue(new Error("connection refused"));
    await expect(
      rateLimitByIp("auth-login", "1.2.3.4", 10, 60),
    ).resolves.toBeUndefined();
  });

  it("scopes keys per tenant", async () => {
    redisMock.incr.mockResolvedValue(1);
    await rateLimitByTenant("public-leads", "t-acme", 100, 60);
    expect(redisMock.incr).toHaveBeenCalledWith("rl:tenant:public-leads:t-acme");
  });
});