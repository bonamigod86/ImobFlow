import { describe, expect, it } from "vitest";
import { QueueName, dlqQueueName } from "@/lib/queues/names";
import { routeTier } from "@/lib/queues/routing";

describe("queue names", () => {
  it("exposes the two production queues", () => {
    expect(QueueName.LEAD_ROUTING).toBe("lead-routing-queue");
    expect(QueueName.WEBHOOK_TRANSMISSION).toBe("webhook-transmission-queue");
  });

  it("computes DLQ names", () => {
    expect(dlqQueueName(QueueName.LEAD_ROUTING)).toBe("lead-routing-queue-dlq");
  });
});

describe("lead routing heuristic", () => {
  it("buckets leads into hot/warm/cold tiers", () => {
    expect(routeTier("SOCIAL_MEDIA")).toBe("hot");
    expect(routeTier("SITE_FORM")).toBe("hot");
    expect(routeTier("PORTAL")).toBe("warm");
    expect(routeTier("PHONE_CALL")).toBe("warm");
    expect(routeTier("INDICATION")).toBe("cold");
    expect(routeTier("MANUAL")).toBe("cold");
  });
});