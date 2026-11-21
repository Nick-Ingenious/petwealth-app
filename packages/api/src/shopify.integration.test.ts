/**
 * Shopify intake against a real database. Run with:
 *   RUN_DB_TESTS=1 pnpm --filter @petwealth/api test
 * Uses random Shopify ids, so it can run repeatedly without reseeding.
 */
import { readFileSync } from "node:fs";
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, getDb, schema as s } from "@petwealth/db";
import { processShopifyWebhook, type ShopifyIntakeOptions } from "./services/shopify";

const run = process.env.RUN_DB_TESTS === "1";
const opts: ShopifyIntakeOptions = { acceptTestOrders: false, smsConsentMode: "marketing_consent" };
const fixture = JSON.parse(
  readFileSync(new URL("../../integrations/src/shopify/__fixtures__/orders-paid.json", import.meta.url), "utf8"),
) as Record<string, any>;

/** A fresh copy of the fixture with unique ids so each test is independent. */
function makeOrder(patch: (o: Record<string, any>) => void = () => {}) {
  const o = structuredClone(fixture);
  o.id = 9_000_000_000_000 + randomInt(1e9);
  o.name = `#T${o.id}`;
  o.customer.id = 8_000_000_000_000 + randomInt(1e9);
  o.email = o.customer.email = `shopify.test.${o.customer.id}@example.com`;
  patch(o);
  return o;
}
const deliver = (payload: Record<string, any>, topic: "orders/paid" | "orders/cancelled" = "orders/paid", webhookId = randomUUID()) =>
  processShopifyWebhook({ webhookId, topic, shopDomain: "petwealth-test.myshopify.com", payload }, opts);

describe.skipIf(!run)("shopify intake (db)", () => {
  afterAll(async () => {
    await getDb().$client.end();
  });

  it("creates customer, order and one kit per panel", async () => {
    const out = await deliver(makeOrder());
    expect(out.outcome).toBe("processed");
    if (out.result?.status !== "created") throw new Error("expected created");
    expect(out.result.kitCount).toBe(4); // Cat Complete (3 panels) + Dog Fecal (1)
    expect(out.result.unmapped).toEqual([]);

    const db = getDb();
    const order = await db.query.orders.findFirst({
      where: eq(s.orders.id, out.result.orderId),
      with: { customer: true, kits: true, items: true, shippingAddress: true },
    });
    expect(order).toMatchObject({ totalCents: 36486, source: "shopify", status: "open" });
    expect(order!.customer).toMatchObject({ phone: "+14155550142", smsOptIn: true, firstName: "Jordan" });
    expect(order!.shippingAddress).toMatchObject({ city: "San Francisco", region: "CA" });
    expect(order!.kits.map((k) => `${k.species}:${k.panel}:${k.status}`).sort()).toEqual([
      "cat:fecal:ordered",
      "cat:oral:ordered",
      "cat:respiratory:ordered",
      "dog:fecal:ordered",
    ]);
    const kitEvents = await db.select().from(s.events).where(and(eq(s.events.type, "kit.created"), eq(s.events.entityId, order!.kits[0]!.id)));
    expect(kitEvents).toHaveLength(1);
  });

  it("is idempotent across redeliveries and duplicate events", async () => {
    const payload = makeOrder();
    const webhookId = randomUUID();
    expect((await deliver(payload, "orders/paid", webhookId)).outcome).toBe("processed");
    expect((await deliver(payload, "orders/paid", webhookId)).outcome).toBe("duplicate"); // same delivery retried
    const again = await deliver(payload); // same order, new delivery id
    expect(again.result?.status).toBe("duplicate");
    const orders = await getDb().select().from(s.orders).where(eq(s.orders.shopifyOrderId, String(payload.id)));
    expect(orders).toHaveLength(1);
  });

  it("reuses an existing customer matched by email", async () => {
    const first = makeOrder();
    await deliver(first);
    const second = makeOrder((o) => {
      o.customer.id = first.customer.id;
      o.email = o.customer.email = first.email.toUpperCase();
    });
    const out = await deliver(second);
    if (out.result?.status !== "created") throw new Error("expected created");
    const rows = await getDb().select().from(s.customers).where(eq(s.customers.shopifyCustomerId, String(first.customer.id)));
    expect(rows).toHaveLength(1);
  });

  it("flags unrecognised physical products instead of guessing", async () => {
    const out = await deliver(
      makeOrder((o) => {
        o.line_items.push({ ...o.line_items[1], id: 14003, variant_id: 1, sku: null, title: "Mystery Box", price: "10.00" });
        o.line_items.push({ ...o.line_items[1], id: 14004, variant_id: 2, sku: null, title: "Gift Card", requires_shipping: false });
      }),
    );
    if (out.result?.status !== "created") throw new Error("expected created");
    expect(out.result.unmapped).toEqual(["Mystery Box"]);
    const flags = await getDb().select().from(s.events).where(and(eq(s.events.entityId, out.result.orderId), eq(s.events.type, "order.needs_attention")));
    expect(flags).toHaveLength(1);
  });

  it("cancels unshipped kits and is idempotent", async () => {
    const payload = makeOrder();
    const created = await deliver(payload);
    if (created.result?.status !== "created") throw new Error("expected created");
    const cancelled = await deliver({ ...payload, cancelled_at: "2026-11-21T18:00:00Z", cancel_reason: "customer" }, "orders/cancelled");
    expect(cancelled.result).toMatchObject({ status: "cancelled", alreadyShipped: [] });
    if (cancelled.result?.status !== "cancelled") throw new Error("expected cancelled");
    expect(cancelled.result.cancelledKits).toHaveLength(4);
    const kits = await getDb().select().from(s.kits).where(eq(s.kits.orderId, created.result.orderId));
    expect(kits.every((k) => k.status === "cancelled")).toBe(true);
    expect((await deliver({ ...payload, cancelled_at: "2026-11-21T18:00:00Z" }, "orders/cancelled")).result?.status).toBe("duplicate");
  });

  it("ignores test orders and rejects malformed payloads", async () => {
    expect((await deliver(makeOrder((o) => (o.test = true)))).result).toMatchObject({ status: "ignored" });
    const bad = await deliver({ id: 1, nonsense: true });
    expect(bad.outcome).toBe("rejected");
    const [row] = await getDb().select().from(s.webhookEvents).where(eq(s.webhookEvents.status, "failed")).limit(1);
    expect(row?.error).toMatch(/Unrecognised Shopify order payload/);
  });
});
