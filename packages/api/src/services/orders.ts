import { kitListQuerySchema } from "@petwealth/domain";
import { and, asc, count, desc, eq, getDb, ilike, inArray, or, schema as s, sql } from "@petwealth/db";
import { requirePermission, type StaffContext } from "../context";
import { notFound } from "../errors";
import { likePattern, offsetOf, toPage } from "../pagination";

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
