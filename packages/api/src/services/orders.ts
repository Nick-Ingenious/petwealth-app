import { z } from "zod";
import { kitListQuerySchema } from "@petwealth/domain";
import { and, asc, count, desc, eq, getDb, ilike, inArray, ne, or, schema as s, sql } from "@petwealth/db";
import { recordEvent } from "../audit";
import { actorFields, requirePermission, type StaffContext } from "../context";
import { conflict, notFound } from "../errors";
import { likePattern, offsetOf, toPage } from "../pagination";
import { changeKitStatus } from "./kits";

/**
 * Orders list. `status` filters to orders that have at least one kit in that
 * kit status — the same definition the dashboard pipeline uses.
 */
export async function listOrders(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "orders.view");
  const q = kitListQuerySchema.parse(input ?? {});
  const db = getDb();

  const kitMatch = (cond: ReturnType<typeof sql>) =>
    sql`exists (select 1 from ${s.kits} where ${s.kits.orderId} = ${s.orders.id} and ${cond})`;

  const where = and(
    q.status ? kitMatch(sql`${s.kits.status} = ${q.status}`) : undefined,
    q.q
      ? or(
          ilike(s.orders.shopifyOrderName, likePattern(q.q)),
          sql`${s.orders.number}::text = ${q.q.replace(/^PW-?/i, "")}`,
          ilike(s.customers.email, likePattern(q.q)),
          ilike(sql`${s.customers.firstName} || ' ' || ${s.customers.lastName}`, likePattern(q.q)),
          kitMatch(sql`${s.kits.code} ilike ${likePattern(q.q)}`),
        )
      : undefined,
  );

  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        id: s.orders.id,
        number: s.orders.number,
        shopifyOrderName: s.orders.shopifyOrderName,
        status: s.orders.status,
        source: s.orders.source,
        totalCents: s.orders.totalCents,
        placedAt: s.orders.placedAt,
        customer: {
          id: s.customers.id,
          email: s.customers.email,
          firstName: s.customers.firstName,
          lastName: s.customers.lastName,
        },
      })
      .from(s.orders)
      .innerJoin(s.customers, eq(s.orders.customerId, s.customers.id))
      .where(where)
      .orderBy(desc(s.orders.placedAt))
      .limit(q.pageSize)
      .offset(offsetOf(q)),
    db
      .select({ total: count() })
      .from(s.orders)
      .innerJoin(s.customers, eq(s.orders.customerId, s.customers.id))
      .where(where),
  ]);

  // Hydrate kits + products for the page in two batched queries (no N+1).
  const ids = rows.map((r) => r.id);
  const [kitRows, itemRows] = ids.length
    ? await Promise.all([
        db
          .select({
            orderId: s.kits.orderId,
            code: s.kits.code,
            status: s.kits.status,
            panel: s.kits.panel,
            species: s.kits.species,
            petName: s.pets.name,
          })
          .from(s.kits)
          .leftJoin(s.pets, eq(s.kits.petId, s.pets.id))
          .where(inArray(s.kits.orderId, ids))
          .orderBy(asc(s.kits.panel)),
        db
          .select({ orderId: s.orderItems.orderId, name: s.products.name, quantity: s.orderItems.quantity })
          .from(s.orderItems)
          .innerJoin(s.products, eq(s.orderItems.productId, s.products.id))
          .where(inArray(s.orderItems.orderId, ids)),
      ])
    : [[], []];

  return toPage(
    rows.map((r) => ({
      ...r,
      kits: kitRows.filter((k) => k.orderId === r.id),
      products: itemRows.filter((i) => i.orderId === r.id).map((i) => i.name),
    })),
    total,
    q,
  );
}

export async function getOrder(ctx: StaffContext, id: string) {
  requirePermission(ctx, "orders.view");
  const db = getDb();
  const order = await db.query.orders.findFirst({
    where: eq(s.orders.id, id),
    with: {
      customer: true,
      shippingAddress: true,
      items: { with: { product: true } },
      kits: { with: { pet: true, shipmentLinks: { with: { shipment: true } } }, orderBy: asc(s.kits.panel) },
    },
  });
  if (!order) throw notFound("Order");
  const kits = order.kits.map(({ shipmentLinks, ...k }) => ({ ...k, shipments: shipmentLinks.map((l) => l.shipment) }));
  const timeline = await db
    .select()
    .from(s.events)
    .where(
      or(
        and(eq(s.events.entityType, "order"), eq(s.events.entityId, order.id)),
        order.kits.length
          ? and(eq(s.events.entityType, "kit"), inArray(s.events.entityId, kits.map((k) => k.id)))
          : undefined,
      ),
    )
    .orderBy(desc(s.events.occurredAt));
  return { ...order, kits, timeline };
}

const orderNoteSchema = z.object({
  orderId: z.uuid(),
  note: z.string().trim().min(1, "Write a note first.").max(1000, "Notes are limited to 1,000 characters."),
});

/** Staff note on an order, stored as an `order.note` event in the audit log. */
export async function addOrderNote(ctx: StaffContext, input: z.input<typeof orderNoteSchema>) {
  requirePermission(ctx, "orders.manage");
  const { orderId, note } = orderNoteSchema.parse(input);
  const db = getDb();
  const order = await db.query.orders.findFirst({ where: eq(s.orders.id, orderId), columns: { id: true } });
  if (!order) throw notFound("Order");
  await recordEvent(db, {
    entityType: "order",
    entityId: order.id,
    type: "order.note",
    ...actorFields(ctx),
    payload: { note, via: ctx.via },
  });
}

const outboundShipmentSchema = z.object({
  orderId: z.uuid(),
  trackingNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{8,40}$/, "Enter a valid tracking number (letters and digits only).")),
  note: z.string().trim().max(1000, "Notes are limited to 1,000 characters.").optional(),
});

/**
 * Record the outbound (kit → customer) tracking number for an order. One
 * shipment covers every non-cancelled kit on the order. Kits still "ordered"
 * move to "label_created"; the tracking cron then moves them to shipped and
 * delivered as FedEx reports. Petwealth ships with FedEx only.
 */
export async function saveOutboundShipment(ctx: StaffContext, input: z.input<typeof outboundShipmentSchema>) {
  requirePermission(ctx, "tracking.manage");
  const { orderId, trackingNumber, note } = outboundShipmentSchema.parse(input);
  const carrier = "fedex";
  const actor = actorFields(ctx);

  return getDb().transaction(async (tx) => {
    const [order] = await tx.select().from(s.orders).where(eq(s.orders.id, orderId)).for("update");
    if (!order) throw notFound("Order");
    if (order.status === "cancelled" || order.status === "refunded") throw conflict("This order is closed, so it can't be shipped.");
    const kits = (await tx.select().from(s.kits).where(eq(s.kits.orderId, order.id)).for("update")).filter((k) => k.status !== "cancelled");
    if (!kits.length) throw conflict("This order has no kits to ship.");

    const [taken] = await tx
      .select({ orderId: s.shipments.orderId })
      .from(s.shipments)
      .where(and(eq(s.shipments.carrier, carrier), eq(s.shipments.trackingNumber, trackingNumber)));
    if (taken && taken.orderId !== order.id) throw conflict("That tracking number is already used by another order.");

    const [existing] = await tx
      .select()
      .from(s.shipments)
      .where(and(eq(s.shipments.orderId, order.id), eq(s.shipments.direction, "outbound"), ne(s.shipments.status, "voided")));

    let shipmentId: string;
    if (existing) {
      if (existing.status !== "label_created" && existing.status !== "pending" && existing.status !== "failed") {
        throw conflict("The carrier has already picked this shipment up, so its tracking number can't be changed.");
      }
      await tx
        .update(s.shipments)
        .set({ carrier, trackingNumber, status: "label_created", error: null, statusDetail: null, lastTrackedAt: null })
        .where(eq(s.shipments.id, existing.id));
      shipmentId = existing.id;
    } else {
      const [created] = await tx
        .insert(s.shipments)
        .values({ direction: "outbound", carrier, trackingNumber, orderId: order.id, customerId: order.customerId, status: "label_created" })
        .returning({ id: s.shipments.id });
      shipmentId = created!.id;
      await tx.insert(s.shipmentKits).values(kits.map((k) => ({ shipmentId, kitId: k.id })));
    }

    for (const kit of kits) {
      if (kit.status === "ordered") await changeKitStatus(tx, kit, "label_created", actor, { via: ctx.via, trackingNumber });
    }
    await recordEvent(tx, {
      entityType: "order",
      entityId: order.id,
      type: existing ? "order.tracking_updated" : "order.tracking_added",
      ...actor,
      payload: { carrier, trackingNumber, previous: existing?.trackingNumber ?? null, via: ctx.via },
    });
    if (note) await recordEvent(tx, { entityType: "order", entityId: order.id, type: "order.note", ...actor, payload: { note, via: ctx.via } });
    return { shipmentId };
  });
}
