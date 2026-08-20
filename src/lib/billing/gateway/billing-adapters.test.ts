import { describe, expect, it } from "vitest";
import {
  asaasAdapter,
  customAdapter,
  stripeAdapter,
} from "@/lib/billing/gateway";

/**
 * Gateway normalization contracts. The adapters convert provider payloads into
 * canonical (provider-agnostic) billing events — this is where cents-units,
 * date mapping and metadata resolution are locked down.
 */

describe("stripeAdapter", () => {
  it("normalizes invoice.paid preserving Stripe minor-unit amounts", () => {
    const raw = JSON.stringify({
      id: "evt_1",
      object: "event",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_123",
          customer: "cus_abc",
          subscription: "sub_xyz",
          amount_paid: 49900,
          currency: "brl",
          status_transitions: { paid_at: "2026-08-14T10:00:00Z" },
        },
      },
    });
    const event = stripeAdapter.parse(raw)[0]!;
    expect(event).toMatchObject({
      providerEventId: "evt_1",
      type: "invoice.paid",
      providerInvoiceId: "in_123",
      customerId: "cus_abc",
      providerSubscriptionId: "sub_xyz",
      amountCents: 49900,
    });
    expect(event.paidAt).toBe("2026-08-14T10:00:00Z");
  });

  it("maps subscription.updated to its canonical type", () => {
    const raw = JSON.stringify({
      id: "evt_2",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_xyz", status: "past_due" } },
    });
    const event = stripeAdapter.parse(raw)[0]!;
    expect(event.type).toBe("subscription.updated");
    expect(event.providerStatus).toBe("past_due");
    expect(event.providerSubscriptionId).toBe("sub_xyz");
  });

  it("flags unrelatable events as unhandled", () => {
    const raw = JSON.stringify({ id: "evt_3", type: "product.updated", data: { object: {} } });
    const event = stripeAdapter.parse(raw)[0]!;
    expect(event.type).toBe("unhandled");
  });
});

describe("asaasAdapter", () => {
  it("converts decimal currency values into integer cents", () => {
    const raw = JSON.stringify({
      event: "PAYMENT_CONFIRMED",
      payment: {
        id: "pay_1",
        customer: "cus_1",
        subscription: "sub_1",
        value: 499.5,
        dueDate: "2026-08-14",
        confirmedDate: "2026-08-13T21:00:00Z",
      },
    });
    const event = asaasAdapter.parse(raw)[0]!;
    expect(event).toMatchObject({
      type: "invoice.paid",
      providerEventId: "pay_1",
      amountCents: 49950,
      providerInvoiceId: "pay_1",
      providerSubscriptionId: "sub_1",
    });
  });

  it("maps PAYMENT_REFUSED to invoice.payment_failed", () => {
    const raw = JSON.stringify({
      event: "PAYMENT_REFUSED",
      payment: { id: "pay_2", value: "1500.00", dueDate: "2026-08-01" },
    });
    const event = asaasAdapter.parse(raw)[0]!;
    expect(event.type).toBe("invoice.payment_failed");
    expect(event.amountCents).toBe(150000);
  });
});

describe("customAdapter", () => {
  it("resolves tenancy from the root id and explicit metadata", () => {
    const raw = JSON.stringify({
      id: "evt_c1",
      type: "invoice.paid",
      tenantId: "t-acme",
      subscriptionId: "sub_1",
      invoiceId: "inv_1",
      amountCents: 49900,
      periodEnd: "2026-09-20T00:00:00Z",
    });
    const event = customAdapter.parse(raw)[0]!;
    expect(event).toMatchObject({
      providerEventId: "evt_c1",
      type: "invoice.paid",
      tenantId: "t-acme",
      providerSubscriptionId: "sub_1",
      providerInvoiceId: "inv_1",
      amountCents: 49900,
      periodEnd: "2026-09-20T00:00:00Z",
    });
  });

  it("keeps the raw payload verbatim for the idempotency ledger", () => {
    const body = JSON.stringify({ id: "evt_c2", type: "checkout.completed" });
    const event = customAdapter.parse(body)[0]!;
    expect(JSON.stringify(event.raw)).toBe(body);
  });
});