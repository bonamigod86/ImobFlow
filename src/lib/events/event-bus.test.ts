import { describe, expect, it } from "vitest";
import { eventBus } from "@/lib/events/event-bus";
import { registerAuditSubscribers } from "@/lib/events/register";

describe("typed domain event bus", () => {
  it("dispatches to listeners and protects against throwing ones", () => {
    const order: string[] = [];
    const boom = () => {
      throw new Error("listener failure");
    };
    const ok = () => order.push("ok");

    eventBus.on("user.login", boom);
    eventBus.on("user.login", ok);

    expect(() =>
      eventBus.emit("user.login", {
        userId: "u1",
        tenantId: null,
        tenantSlug: null,
        email: "a@b.co",
        method: "password",
      }),
    ).not.toThrow();

    expect(order).toEqual(["ok"]);
  });

  it("unsubscribes listeners", () => {
    let calls = 0;
    const listener = () => {
      calls += 1;
    };
    eventBus.on("user.logout", listener);
    eventBus.emit("user.logout", { userId: "u1", tenantId: null });
    eventBus.off("user.logout", listener);
    eventBus.emit("user.logout", { userId: "u1", tenantId: null });
    expect(calls).toBe(1);
  });

  it("registers audit subscribers exactly once", () => {
    const before = eventBus.countListeners("tenant.status_changed");
    registerAuditSubscribers();
    registerAuditSubscribers();
    const after = eventBus.countListeners("tenant.status_changed");

    // First import already registered them (self-register on load); calling
    // again must NOT double-register.
    expect(after).toBeGreaterThanOrEqual(1);
    expect(after).toBe(before);
  });
});