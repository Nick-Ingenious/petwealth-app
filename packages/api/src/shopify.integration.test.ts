/**
 * Shopify intake against a real database. Run with:
 *   RUN_DB_TESTS=1 pnpm --filter @petwealth/api test
 * Uses random Shopify ids, so it can run repeatedly without reseeding.
 */
import { readFileSync } from "node:fs";
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, getDb, schema as s } from "@petwealth/db";
import type { ShopifyTopic } from "@petwealth/integrations/shopify";
import { ALL_PERMISSIONS } from "@petwealth/domain";
import type { StaffContext } from "./context";
import { backfillShopifyFulfillments, processShopifyWebhook, type ShopifyIntakeOptions } from "./services/shopify";

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
const deliver = (payload: Record<string, any>, topic: ShopifyTopic = "orders/paid", webhookId = randomUUID()) =>
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
  it("ships kits from Shopify fulfilments, then marks them delivered", async () => {
    const order = makeOrder();
    const intake = await deliver(order);
    if (intake.result?.status !== "created") throw new Error("expected created");
    const fulfillment = (patch: Record<string, any>) => ({
      id: 7_000_000_000_000 + randomInt(1e9),
      order_id: order.id,
      name: `${order.name}.1`,
      status: "success",
      shipment_status: null,
      tracking_company: "USPS",
      tracking_number: `9400${randomInt(1e9)}`,
      tracking_url: "https://tools.usps.com/go/TrackConfirmAction?tLabels=x",
      created_at: "2026-11-20T15:00:00-05:00",
      updated_at: "2026-11-20T15:00:00-05:00",
      line_items: [{ id: 14001, variant_id: 44000000001, sku: "PW-CAT-COMPLETE", title: "Cat Complete Health Kit", quantity: 1 }],
      ...patch,
    });

    // Partial fulfilment: only the Cat Complete line (3 kits) ships.
    const first = fulfillment({});
    const out = await deliver(first, "fulfillments/create");
    expect(out.result).toMatchObject({ status: "fulfilment_synced", created: true, kitsShipped: 3, kitsDelivered: 0 });
    const db = getDb();
    const orderId = intake.result.orderId;
    const kits = () => db.select().from(s.kits).where(eq(s.kits.orderId, orderId));
    expect((await kits()).map((k) => `${k.species}:${k.status}`).sort()).toEqual(["cat:shipped", "cat:shipped", "cat:shipped", "dog:ordered"]);
    const [ship] = await db.select().from(s.shipments).where(eq(s.shipments.shopifyFulfillmentId, String(first.id)));
    expect(ship).toMatchObject({ direction: "outbound", carrier: "usps", status: "in_transit", trackingNumber: first.tracking_number });
    const [o1] = await db.select().from(s.orders).where(eq(s.orders.id, intake.result.orderId));
    expect(o1!.status).toBe("open");

    // Same delivery again is a no-op.
    expect((await deliver(first, "fulfillments/create")).outcome).toBe("processed");
    expect((await kits()).filter((k) => k.status === "shipped")).toHaveLength(3);

    // Carrier reports delivery through Shopify.
    const delivered = await deliver({ ...first, shipment_status: "delivered", updated_at: "2026-11-22T10:00:00-05:00" }, "fulfillments/update");
    expect(delivered.result).toMatchObject({ status: "fulfilment_synced", created: false, kitsDelivered: 3 });

    // Second fulfilment with no line items ships what's left; the order is then fulfilled.
    const second = await deliver(fulfillment({ name: `${order.name}.2`, tracking_company: "FedEx", tracking_number: `7${randomInt(1e9)}`, line_items: [] }), "fulfillments/create");
    expect(second.result).toMatchObject({ kitsShipped: 1 });
    expect((await kits()).map((k) => k.status).sort()).toEqual(["delivered", "delivered", "delivered", "shipped"]);
    const [o2] = await db.select().from(s.orders).where(eq(s.orders.id, intake.result.orderId));
    expect(o2!.status).toBe("fulfilled");
    // Kits keep no customer email for shipping (the old app never sent one).
    const emails = await db.select().from(s.notifications).where(eq(s.notifications.customerId, o2!.customerId));
    expect(emails).toHaveLength(0);
  });

  it("ignores fulfilments for orders we never imported", async () => {
    const out = await deliver(
      { id: randomInt(1e9), order_id: 1, status: "success", created_at: "2026-11-20T15:00:00Z", line_items: [] },
      "fulfillments/create",
    );
    expect(out.result).toMatchObject({ status: "ignored", reason: "Order was never imported" });
  });
  it("backfills fulfilments from the Admin API", async () => {
    const order = makeOrder();
    const intake = await deliver(order);
    if (intake.result?.status !== "created") throw new Error("expected created");
    const staff: StaffContext = { kind: "staff", staffId: randomUUID(), email: "ops@petwealth.com", name: null, role: "super_admin", permissions: new Set(ALL_PERMISSIONS), via: "admin_ui" };
    const calls: string[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const { variables } = JSON.parse(String(init.body)) as { variables: { id: string } };
      calls.push(variables.id);
      const isOurs = variables.id === `gid://shopify/Order/${order.id}`;
      return new Response(
        JSON.stringify({
          data: {
            order: {
              id: variables.id,
              fulfillments: isOurs
                ? [
                    {
                      id: `gid://shopify/Fulfillment/${randomInt(1e9)}`,
                      name: `${order.name}.1`,
                      status: "SUCCESS",
                      displayStatus: "DELIVERED",
                      createdAt: "2026-11-20T20:00:00Z",
                      updatedAt: "2026-11-22T20:00:00Z",
                      trackingInfo: [{ company: "USPS", number: `9400${randomInt(1e9)}`, url: null }],
                      fulfillmentLineItems: { nodes: [] },
                    },
                  ]
                : [],
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    await expect(backfillShopifyFulfillments(staff, { shopDomain: null, accessToken: null })).rejects.toThrow(/SHOPIFY_ADMIN_ACCESS_TOKEN/);
    const out = await backfillShopifyFulfillments(staff, { shopDomain: "petwealth-test.myshopify.com", accessToken: "test", limit: 500, fetchImpl });
    expect(calls).toContain(`gid://shopify/Order/${order.id}`);
    expect(out.errors).toEqual([]);
    const kits = await getDb().select().from(s.kits).where(eq(s.kits.orderId, intake.result.orderId));
    expect(kits.map((k) => k.status)).toEqual(["delivered", "delivered", "delivered", "delivered"]);
  });
});
