/**
 * Shopify order intake.
 *
 *   webhook ──► processShopifyWebhook ──► webhook_events (dedupe + audit)
 *                          │
 *                          ├─ orders/paid      ──► ingestShopifyOrder   → customer, address, order, kits
 *                          └─ orders/cancelled ──► cancelShopifyOrder  → cancel unshipped kits
 *
 * Every path is idempotent: Shopify retries deliveries and can send the same
 * event twice, so re-processing an already-handled order is a no-op.
 */
import { panelsForTestType, parseKitProductTitle, type KitStatus } from "@petwealth/domain";
import { and, eq, getDb, schema as s, sql, type DbOrTx } from "@petwealth/db";
import {
  ShopifyPayloadError,
  normalizeShopifyOrder,
  type NormalizedOrder,
  type ShopifyTopic,
} from "@petwealth/integrations/shopify";
import { SHOPIFY_ACTOR, recordEvent } from "../audit";
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
        .values({ orderId: row!.id, productId: product.id, quantity: li.quantity, unitPriceCents: li.unitPriceCents })
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
        payload: { reason: "Unrecognised products — no kits created for these items", items: unmapped },
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
        ...(alreadyShipped.length ? { alreadyShipped, action: "Kits already shipped — arrange return/refund manually" } : {}),
      },
    });
    return { status: "cancelled", orderId: existing.id, cancelledKits, alreadyShipped };
  });
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
    const order = normalizeShopifyOrder(d.payload);
    const result = d.topic === "orders/cancelled" ? await cancelShopifyOrder(order) : await ingestShopifyOrder(order, opts);
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
