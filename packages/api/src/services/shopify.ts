/**
 * Shopify order intake.
 *
 *   webhook ──► processShopifyWebhook ──► webhook_events (dedupe + audit)
 *                          │
 *                          ├─ orders/paid         ──► ingestShopifyOrder       → customer, address, order, kits
 *                          ├─ orders/cancelled    ──► cancelShopifyOrder       → cancel unshipped kits
 *                          └─ fulfillments/create ──► syncShopifyFulfillment   → outbound shipment, kits Shipped
 *                             fulfillments/update                              → tracking, kits Delivered
 *
 * Outbound kits are packed and shipped by ShipStation (customers) and Defender
 * (3PL); both write the fulfilment back to Shopify, which is where we read it.
 *
 * Every path is idempotent: Shopify retries deliveries and can send the same
 * event twice, so re-processing an already-handled order is a no-op.
 */
import { panelsForTestType, parseKitProductTitle, type KitStatus } from "@petwealth/domain";
import { and, asc, eq, getDb, inArray, schema as s, sql, type DbOrTx } from "@petwealth/db";
import {
  ShopifyPayloadError,
  fetchOrderFulfillments,
  normalizeShopifyFulfillment,
  normalizeShopifyOrder,
  type NormalizedFulfillment,
  type NormalizedOrder,
  type ShopifyTopic,
} from "@petwealth/integrations/shopify";
import { SHOPIFY_ACTOR, recordEvent } from "../audit";
import { requirePermission, type StaffContext } from "../context";
import { invalid } from "../errors";
import { changeKitStatus } from "./kits";

export interface ShopifyIntakeOptions {
  /** Shopify test orders (bogus gateway) are ignored unless this is true. */
  acceptTestOrders: boolean;
  /**
   * When to mark a new customer as opted in to transactional SMS:
   * - "marketing_consent": only if they subscribed to SMS at checkout (safest default)
   * - "checkout_phone": any customer who gave a phone number
   */
  smsConsentMode: "marketing_consent" | "checkout_phone";
}

export type IntakeResult =
  | { status: "created"; orderId: string; orderNumber: number; kitCount: number; unmapped: string[] }
  | { status: "cancelled"; orderId: string; cancelledKits: string[]; alreadyShipped: string[] }
  | { status: "duplicate"; orderId?: string }
  | { status: "fulfilment_synced"; orderId: string; shipmentId: string; created: boolean; kitsShipped: number; kitsDelivered: number }
  | { status: "ignored"; reason: string };

// ── Products ───────────────────────────────────────────────────────────

type LineItem = NormalizedOrder["lineItems"][number];

/**
 * Resolve a Shopify line item to our catalog: variant id → SKU → product
 * title. A recognised title with no catalog row creates one, so the catalog
 * fills itself from real orders. Returns null for non-kit items.
 */
async function resolveProduct(tx: DbOrTx, li: LineItem) {
  if (li.variantId) {
    const byVariant = await tx.query.products.findFirst({ where: eq(s.products.shopifyVariantId, li.variantId) });
    if (byVariant) return byVariant;
  }
  if (li.sku) {
    const bySku = await tx.query.products.findFirst({ where: sql`lower(${s.products.sku}) = ${li.sku.toLowerCase()}` });
    if (bySku) return bySku;
  }
  const parsed = parseKitProductTitle(li.title);
  if (!parsed) return null;

  const sameKind = await tx.query.products.findFirst({
    where: and(eq(s.products.species, parsed.species), eq(s.products.testType, parsed.testType), sql`${s.products.shopifyVariantId} is null`),
  });
  if (sameKind && li.variantId) {
    const [linked] = await tx.update(s.products).set({ shopifyVariantId: li.variantId }).where(eq(s.products.id, sameKind.id)).returning();
    return linked!;
  }
  if (sameKind) return sameKind;

  const [created] = await tx
    .insert(s.products)
    .values({
      sku: li.sku ?? `SHOPIFY-${li.variantId ?? li.shopifyLineItemId}`,
      shopifyVariantId: li.variantId,
      name: li.title,
      species: parsed.species,
      testType: parsed.testType,
      priceCents: li.unitPriceCents,
    })
    .onConflictDoNothing()
    .returning();
  return created ?? (await tx.query.products.findFirst({ where: eq(s.products.sku, li.sku ?? "") })) ?? null;
}

// ── Customers ──────────────────────────────────────────────────────────

async function upsertCustomer(tx: DbOrTx, c: NormalizedOrder["customer"], opts: ShopifyIntakeOptions) {
  const consent = opts.smsConsentMode === "checkout_phone" ? Boolean(c.phone) : c.smsMarketingConsent && Boolean(c.phone);
  const existing =
    (c.shopifyCustomerId &&
      (await tx.query.customers.findFirst({ where: eq(s.customers.shopifyCustomerId, c.shopifyCustomerId) }))) ||
    (await tx.query.customers.findFirst({ where: sql`lower(${s.customers.email}) = ${c.email}` }));

  if (!existing) {
    const [row] = await tx
      .insert(s.customers)
      .values({
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        smsOptIn: consent,
        shopifyCustomerId: c.shopifyCustomerId,
      })
      .returning();
    return { customer: row!, created: true };
  }
  // Fill gaps only — never overwrite details staff or the customer already set,
  // and never turn SMS *off* from Shopify (opt-outs are handled via STOP replies).
  const patch: Partial<typeof s.customers.$inferInsert> = {};
  if (!existing.shopifyCustomerId && c.shopifyCustomerId) patch.shopifyCustomerId = c.shopifyCustomerId;
  if (!existing.firstName && c.firstName) patch.firstName = c.firstName;
  if (!existing.lastName && c.lastName) patch.lastName = c.lastName;
  if (!existing.phone && c.phone) patch.phone = c.phone;
  if (!existing.smsOptIn && consent) patch.smsOptIn = true;
  if (!Object.keys(patch).length) return { customer: existing, created: false };
  const [row] = await tx.update(s.customers).set(patch).where(eq(s.customers.id, existing.id)).returning();
  return { customer: row!, created: false };
}

async function upsertAddress(tx: DbOrTx, customerId: string, a: NonNullable<NormalizedOrder["shippingAddress"]>) {
  const existing = await tx.query.addresses.findFirst({
    where: and(eq(s.addresses.customerId, customerId), sql`lower(${s.addresses.line1}) = ${a.line1.toLowerCase()}`, eq(s.addresses.postalCode, a.postalCode)),
  });
  if (existing) return existing;
  const hasDefault = await tx.$count(s.addresses, and(eq(s.addresses.customerId, customerId), eq(s.addresses.isDefault, true)));
  const [row] = await tx.insert(s.addresses).values({ customerId, ...a, isDefault: hasDefault === 0 }).returning();
  return row!;
}

// ── Orders ─────────────────────────────────────────────────────────────

export async function ingestShopifyOrder(order: NormalizedOrder, opts: ShopifyIntakeOptions): Promise<IntakeResult> {
  if (order.isTest && !opts.acceptTestOrders) return { status: "ignored", reason: "Shopify test order" };
  if (order.cancelledAt) return { status: "ignored", reason: "Order is already cancelled in Shopify" };

  return getDb().transaction(async (tx) => {
    const dup = await tx.query.orders.findFirst({ where: eq(s.orders.shopifyOrderId, order.shopifyOrderId) });
    if (dup) return { status: "duplicate", orderId: dup.id };

    const resolved: { li: LineItem; product: NonNullable<Awaited<ReturnType<typeof resolveProduct>>> }[] = [];
    const unmapped: string[] = [];
    for (const li of order.lineItems) {
      const product = await resolveProduct(tx, li);
      if (product) resolved.push({ li, product });
      else if (li.requiresShipping) unmapped.push(li.title);
    }
    if (!resolved.length && !unmapped.length) return { status: "ignored", reason: "No physical items (e.g. gift card only)" };

    const { customer, created: newCustomer } = await upsertCustomer(tx, order.customer, opts);
    const address = order.shippingAddress ? await upsertAddress(tx, customer.id, order.shippingAddress) : null;

    const [row] = await tx
      .insert(s.orders)
      .values({
        shopifyOrderId: order.shopifyOrderId,
        shopifyOrderName: order.name,
        customerId: customer.id,
        source: "shopify",
        subtotalCents: order.subtotalCents,
        discountCents: order.discountCents,
        shippingCents: order.shippingCents,
        taxCents: order.taxCents,
        totalCents: order.totalCents,
        shippingAddressId: address?.id ?? null,
        placedAt: order.placedAt,
      })
      .returning();

    let kitCount = 0;
    for (const { li, product } of resolved) {
      const [item] = await tx
        .insert(s.orderItems)
        .values({ orderId: row!.id, productId: product.id, quantity: li.quantity, unitPriceCents: li.unitPriceCents, shopifyLineItemId: li.shopifyLineItemId })
        .returning();
      const kitRows = Array.from({ length: li.quantity }).flatMap(() =>
        panelsForTestType(product.testType).map((panel) => ({
          orderId: row!.id,
          orderItemId: item!.id,
          customerId: customer.id,
          species: product.species,
          panel,
          status: "ordered" as KitStatus,
        })),
      );
      const kits = await tx.insert(s.kits).values(kitRows).returning({ id: s.kits.id });
      for (const k of kits) {
        await recordEvent(tx, { entityType: "kit", entityId: k.id, type: "kit.created", ...SHOPIFY_ACTOR, payload: { product: product.name } });
      }
      kitCount += kits.length;
    }

    await recordEvent(tx, {
      entityType: "order",
      entityId: row!.id,
      type: "order.created",
      ...SHOPIFY_ACTOR,
      payload: { shopifyOrderName: order.name, totalCents: order.totalCents, kitCount, newCustomer },
    });
    if (unmapped.length) {
      await recordEvent(tx, {
        entityType: "order",
        entityId: row!.id,
        type: "order.needs_attention",
        ...SHOPIFY_ACTOR,
        payload: { reason: "Unrecognised products, so no kits were created for these items", items: unmapped },
      });
    }
    return { status: "created", orderId: row!.id, orderNumber: row!.number!, kitCount, unmapped };
  });
}

/** Statuses that can still be cancelled without anything physical having happened. */
const CANCELLABLE: readonly KitStatus[] = ["ordered", "label_created"];

export async function cancelShopifyOrder(order: NormalizedOrder): Promise<IntakeResult> {
  return getDb().transaction(async (tx) => {
    const existing = await tx.query.orders.findFirst({ where: eq(s.orders.shopifyOrderId, order.shopifyOrderId) });
    if (!existing) return { status: "ignored", reason: "Order was never imported" };
    if (existing.status === "cancelled") return { status: "duplicate", orderId: existing.id };

    const kits = await tx.select().from(s.kits).where(eq(s.kits.orderId, existing.id)).for("update");
    const cancelledKits: string[] = [];
    const alreadyShipped: string[] = [];
    for (const kit of kits) {
      if (CANCELLABLE.includes(kit.status)) {
        await changeKitStatus(tx, kit, "cancelled", SHOPIFY_ACTOR, { reason: order.cancelReason ?? "Cancelled in Shopify" });
        cancelledKits.push(kit.code ?? kit.id);
      } else if (kit.status !== "cancelled") {
        alreadyShipped.push(kit.code ?? kit.id);
      }
    }
    await tx
      .update(s.orders)
      .set({ status: "cancelled", cancelledAt: order.cancelledAt ?? new Date(), cancelReason: order.cancelReason })
      .where(eq(s.orders.id, existing.id));
    await recordEvent(tx, {
      entityType: "order",
      entityId: existing.id,
      type: alreadyShipped.length ? "order.needs_attention" : "order.cancelled",
      ...SHOPIFY_ACTOR,
      payload: {
        reason: order.cancelReason,
        cancelledKits,
        ...(alreadyShipped.length ? { alreadyShipped, action: "Kits already shipped. Arrange the return or refund manually" } : {}),
      },
    });
    return { status: "cancelled", orderId: existing.id, cancelledKits, alreadyShipped };
  });
}

// ── Fulfilments ───────────────────────────────────────────────────────

type KitRow = typeof s.kits.$inferSelect;

/** Kits still waiting to leave the warehouse. */
const NOT_SHIPPED: readonly KitStatus[] = ["ordered", "label_created"];

/**
 * The order's kits a fulfilment shipped: match each fulfilled line item to
 * its order item (line item id, then variant, SKU or title for orders imported
 * before we stored line item ids), then take that many unshipped kits. A
 * fulfilment with no line items ships everything still waiting.
 */
async function kitsForFulfillment(tx: DbOrTx, orderId: string, f: NormalizedFulfillment): Promise<KitRow[]> {
  const already = tx
    .select({ kitId: s.shipmentKits.kitId })
    .from(s.shipmentKits)
    .innerJoin(s.shipments, eq(s.shipmentKits.shipmentId, s.shipments.id))
    .where(and(eq(s.shipments.direction, "outbound"), eq(s.shipments.orderId, orderId)));
  const waiting = await tx
    .select()
    .from(s.kits)
    .where(and(eq(s.kits.orderId, orderId), inArray(s.kits.status, [...NOT_SHIPPED]), sql`${s.kits.id} not in (${already})`))
    .orderBy(asc(s.kits.createdAt))
    .for("update");
  if (!f.lineItems.length) return waiting;

  const items = await tx
    .select({ item: s.orderItems, product: s.products })
    .from(s.orderItems)
    .innerJoin(s.products, eq(s.orderItems.productId, s.products.id))
    .where(eq(s.orderItems.orderId, orderId));
  const used = new Set<string>();
  const picked: KitRow[] = [];
  for (const li of f.lineItems) {
    const parsed = parseKitProductTitle(li.title);
    const match =
      items.find((x) => x.item.shopifyLineItemId === li.shopifyLineItemId) ??
      items.find((x) => li.variantId && x.product.shopifyVariantId === li.variantId) ??
      items.find((x) => li.sku && x.product.sku.toLowerCase() === li.sku.toLowerCase()) ??
      items.find((x) => parsed && x.product.species === parsed.species && x.product.testType === parsed.testType);
    if (!match) continue; // not a kit (e.g. merch)
    const want = li.quantity * panelsForTestType(match.product.testType).length;
    for (const kit of waiting) {
      if (picked.length && picked.filter((k) => k.orderItemId === match.item.id).length >= want) break;
      if (kit.orderItemId === match.item.id && !used.has(kit.id)) {
        used.add(kit.id);
        picked.push(kit);
      }
    }
  }
  return picked;
}

const SHIPMENT_STATUS = { shipped: "in_transit", delivered: "delivered", cancelled: "voided", failed: "exception" } as const;

/** Record (or update) the outbound shipment for a Shopify fulfilment and move its kits along. */
export async function syncShopifyFulfillment(f: NormalizedFulfillment): Promise<IntakeResult> {
  return getDb().transaction(async (tx) => {
    const order = await tx.query.orders.findFirst({ where: eq(s.orders.shopifyOrderId, f.shopifyOrderId) });
    if (!order) return { status: "ignored", reason: "Order was never imported" };

    const status = SHIPMENT_STATUS[f.state];
    const deliveredAt = f.state === "delivered" ? f.occurredAt : null;
    let [shipment] = await tx.select().from(s.shipments).where(eq(s.shipments.shopifyFulfillmentId, f.shopifyFulfillmentId)).for("update");
    const created = !shipment;

    if (!shipment) {
      // Split fulfilments can share one tracking number; keep the first owner of it.
      const clash =
        f.trackingNumber &&
        (await tx.query.shipments.findFirst({ where: and(eq(s.shipments.carrier, f.carrier), eq(s.shipments.trackingNumber, f.trackingNumber)) }));
      [shipment] = await tx
        .insert(s.shipments)
        .values({
          direction: "outbound",
          carrier: f.carrier,
          trackingNumber: clash ? null : f.trackingNumber,
          trackingUrl: f.trackingUrl,
          status,
          statusDetail: [f.carrierName, f.name, clash ? `tracking ${f.trackingNumber}` : null].filter(Boolean).join(" · ") || null,
          orderId: order.id,
          customerId: order.customerId,
          shopifyFulfillmentId: f.shopifyFulfillmentId,
          pickedUpAt: f.occurredAt,
          deliveredAt,
          lastCarrierEventAt: f.occurredAt,
        })
        .returning();
      const kits = await kitsForFulfillment(tx, order.id, f);
      if (kits.length) await tx.insert(s.shipmentKits).values(kits.map((k) => ({ shipmentId: shipment!.id, kitId: k.id })));
      await recordEvent(tx, {
        entityType: "shipment",
        entityId: shipment!.id,
        type: "shipment.created",
        ...SHOPIFY_ACTOR,
        payload: { direction: "outbound", fulfillment: f.name, carrier: f.carrierName, trackingNumber: f.trackingNumber, kits: kits.length },
      });
      if (!kits.length) {
        await recordEvent(tx, {
          entityType: "order",
          entityId: order.id,
          type: "order.needs_attention",
          ...SHOPIFY_ACTOR,
          payload: { reason: `Shopify fulfilment ${f.name ?? f.shopifyFulfillmentId} didn't match any kits waiting to ship` },
        });
      }
    } else if (shipment.status !== status || (f.trackingNumber && shipment.trackingNumber !== f.trackingNumber && !shipment.trackingNumber)) {
      [shipment] = await tx
        .update(s.shipments)
        .set({
          status,
          trackingNumber: shipment.trackingNumber ?? f.trackingNumber,
          trackingUrl: f.trackingUrl ?? shipment.trackingUrl,
          deliveredAt: deliveredAt ?? shipment.deliveredAt,
          lastCarrierEventAt: f.occurredAt,
        })
        .where(eq(s.shipments.id, shipment.id))
        .returning();
      await recordEvent(tx, {
        entityType: "shipment",
        entityId: shipment!.id,
        type: `shipment.${status}`,
        ...SHOPIFY_ACTOR,
        payload: { fulfillment: f.name, trackingNumber: f.trackingNumber },
      });
    }

    const kitIds = (await tx.select({ kitId: s.shipmentKits.kitId }).from(s.shipmentKits).where(eq(s.shipmentKits.shipmentId, shipment!.id))).map((r) => r.kitId);
    const kits = kitIds.length ? await tx.select().from(s.kits).where(inArray(s.kits.id, kitIds)).for("update") : [];
    const payload = { via: "shopify", fulfillment: f.name, carrier: f.carrierName, trackingNumber: f.trackingNumber };
    let kitsShipped = 0;
    let kitsDelivered = 0;
    if (f.state === "shipped" || f.state === "delivered") {
      for (let kit of kits) {
        if (NOT_SHIPPED.includes(kit.status)) {
          kit = await changeKitStatus(tx, kit, "shipped", SHOPIFY_ACTOR, payload);
          kitsShipped++;
        }
        if (f.state === "delivered" && kit.status === "shipped") {
          await changeKitStatus(tx, kit, "delivered", SHOPIFY_ACTOR, payload);
          kitsDelivered++;
        }
      }
    } else if (created || kits.some((k) => k.status === "shipped")) {
      await recordEvent(tx, {
        entityType: "order",
        entityId: order.id,
        type: "order.needs_attention",
        ...SHOPIFY_ACTOR,
        payload: { reason: `Shopify fulfilment ${f.name ?? f.shopifyFulfillmentId} was ${f.state}. Check the kits' status by hand.` },
      });
    }

    // The order is fulfilled once nothing is left waiting to ship.
    if (order.status === "open") {
      const [left] = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(s.kits)
        .where(and(eq(s.kits.orderId, order.id), inArray(s.kits.status, [...NOT_SHIPPED])));
      if (!left?.n && kitsShipped) await tx.update(s.orders).set({ status: "fulfilled" }).where(eq(s.orders.id, order.id));
    }
    return { status: "fulfilment_synced", orderId: order.id, shipmentId: shipment!.id, created, kitsShipped, kitsDelivered };
  });
}

/**
 * Pull fulfilments from the Shopify Admin API for orders that still have kits
 * waiting to ship (orders fulfilled before the webhooks were set up). Run from
 * the admin Orders page; each run handles up to `limit` orders.
 */
export async function backfillShopifyFulfillments(
  ctx: StaffContext,
  opts: { shopDomain?: string | null; accessToken?: string | null; apiVersion?: string; limit?: number; fetchImpl?: typeof fetch },
) {
  requirePermission(ctx, "orders.manage");
  if (!opts.shopDomain || !opts.accessToken) {
    throw invalid("Shopify Admin API access isn't set up yet. Add SHOPIFY_ADMIN_ACCESS_TOKEN in Vercel.");
  }
  const db = getDb();
  const orders = await db
    .selectDistinct({ id: s.orders.id, shopifyOrderId: s.orders.shopifyOrderId, placedAt: s.orders.placedAt })
    .from(s.orders)
    .innerJoin(s.kits, eq(s.kits.orderId, s.orders.id))
    .where(and(eq(s.orders.source, "shopify"), eq(s.orders.status, "open"), inArray(s.kits.status, [...NOT_SHIPPED]), sql`${s.orders.shopifyOrderId} is not null`))
    .orderBy(asc(s.orders.placedAt));
  const batch = orders.slice(0, opts.limit ?? 40);
  const result = { checked: 0, fulfilments: 0, kitsShipped: 0, kitsDelivered: 0, remaining: orders.length - batch.length, errors: [] as string[] };
  for (const o of batch) {
    result.checked++;
    try {
      const fulfilments = await fetchOrderFulfillments(
        { shopDomain: opts.shopDomain, accessToken: opts.accessToken, apiVersion: opts.apiVersion, fetchImpl: opts.fetchImpl },
        o.shopifyOrderId!,
      );
      for (const f of fulfilments) {
        const r = await syncShopifyFulfillment(f);
        if (r.status === "fulfilment_synced") {
          result.fulfilments++;
          result.kitsShipped += r.kitsShipped;
          result.kitsDelivered += r.kitsDelivered;
        }
      }
    } catch (e) {
      if (e instanceof ShopifyPayloadError && /token/.test(e.message)) throw invalid(e.message);
      result.errors.push(`Order ${o.shopifyOrderId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

// ── Webhook entry point ────────────────────────────────────────────────

export interface ShopifyDelivery {
  webhookId: string;
  topic: ShopifyTopic;
  shopDomain: string;
  payload: Record<string, unknown>;
}

export type WebhookOutcome = { outcome: "processed" | "ignored" | "duplicate" | "rejected"; result?: IntakeResult; error?: string };

/**
 * Record + process one verified delivery. Throws only for transient failures
 * (e.g. database down) so the route can return 5xx and Shopify retries;
 * malformed payloads are recorded as failed and acknowledged, since retrying
 * them can never succeed.
 */
export async function processShopifyWebhook(d: ShopifyDelivery, opts: ShopifyIntakeOptions): Promise<WebhookOutcome> {
  const db = getDb();
  const [inserted] = await db
    .insert(s.webhookEvents)
    .values({ source: "shopify", externalId: d.webhookId, topic: d.topic, shopDomain: d.shopDomain, payload: d.payload })
    .onConflictDoNothing()
    .returning();
  let event = inserted;
  if (!event) {
    const [prior] = await db
      .select()
      .from(s.webhookEvents)
      .where(and(eq(s.webhookEvents.source, "shopify"), eq(s.webhookEvents.externalId, d.webhookId)));
    if (prior && prior.status !== "failed") return { outcome: "duplicate" };
    [event] = await db
      .update(s.webhookEvents)
      .set({ attempts: sql`${s.webhookEvents.attempts} + 1`, status: "received", error: null })
      .where(eq(s.webhookEvents.id, prior!.id))
      .returning();
  }

  const finish = (status: "processed" | "ignored" | "failed", values: { result?: IntakeResult; error?: string }) =>
    db
      .update(s.webhookEvents)
      .set({ status, result: (values.result ?? null) as Record<string, unknown> | null, error: values.error ?? null, processedAt: new Date() })
      .where(eq(s.webhookEvents.id, event!.id));

  try {
    const result =
      d.topic === "fulfillments/create" || d.topic === "fulfillments/update"
        ? await syncShopifyFulfillment(normalizeShopifyFulfillment(d.payload))
        : d.topic === "orders/cancelled"
          ? await cancelShopifyOrder(normalizeShopifyOrder(d.payload))
          : await ingestShopifyOrder(normalizeShopifyOrder(d.payload), opts);
    const status = result.status === "ignored" || result.status === "duplicate" ? "ignored" : "processed";
    await finish(status, { result });
    return { outcome: status, result };
  } catch (e) {
    if (e instanceof ShopifyPayloadError) {
      await finish("failed", { error: e.message });
      return { outcome: "rejected", error: e.message };
    }
    await finish("failed", { error: e instanceof Error ? e.message : String(e) }).catch(() => undefined);
    throw e;
  }
}
