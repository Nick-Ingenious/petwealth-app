import { customerUpdateSchema, listQuerySchema, type CustomerUpdate } from "@petwealth/domain";
import { and, count, desc, eq, getDb, ilike, ne, or, schema as s, sql } from "@petwealth/db";
import { recordEvent } from "../audit";
import { actorFields, requirePermission, type StaffContext } from "../context";
import { conflict, notFound } from "../errors";
import { likePattern, offsetOf, toPage } from "../pagination";

export async function listCustomers(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "customers.view");
  const q = listQuerySchema.parse(input ?? {});
  const db = getDb();
  const where = q.q
    ? or(
        ilike(s.customers.email, likePattern(q.q)),
        ilike(sql`${s.customers.firstName} || ' ' || ${s.customers.lastName}`, likePattern(q.q)),
        ilike(s.customers.phone, likePattern(q.q.replace(/[^\d]/g, "") || q.q)),
        sql`${s.customers.number}::text = ${q.q.replace(/^CUS-?/i, "")}`,
      )
    : undefined;

  const petCount = db.$count(s.pets, eq(s.pets.customerId, s.customers.id));
  const orderCount = db.$count(s.orders, eq(s.orders.customerId, s.customers.id));
  const totalSpent = sql<number>`coalesce((select sum(${s.orders.totalCents}) from ${s.orders} where ${s.orders.customerId} = ${s.customers.id} and ${s.orders.status} <> 'refunded'), 0)::int`;

  const [items, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        id: s.customers.id,
        number: s.customers.number,
        email: s.customers.email,
        firstName: s.customers.firstName,
        lastName: s.customers.lastName,
        phone: s.customers.phone,
        status: s.customers.status,
        smsOptIn: s.customers.smsOptIn,
        createdAt: s.customers.createdAt,
        petCount,
        orderCount,
        totalSpentCents: totalSpent,
      })
      .from(s.customers)
      .where(where)
      .orderBy(desc(s.customers.createdAt))
      .limit(q.pageSize)
      .offset(offsetOf(q)),
    db.select({ total: count() }).from(s.customers).where(where),
  ]);
  return toPage(items, total, q);
}

export async function getCustomer(ctx: StaffContext, id: string) {
  requirePermission(ctx, "customers.view");
  const customer = await getDb().query.customers.findFirst({
    where: eq(s.customers.id, id),
    with: {
      addresses: true,
      pets: { orderBy: desc(s.pets.createdAt) },
      orders: { orderBy: desc(s.orders.placedAt), with: { kits: true } },
    },
  });
  if (!customer) throw notFound("Customer");
  const notifications = await getDb()
    .select()
    .from(s.notifications)
    .where(eq(s.notifications.customerId, id))
    .orderBy(desc(s.notifications.createdAt))
    .limit(20);
  return { ...customer, notifications };
}

export async function updateCustomer(ctx: StaffContext, id: string, input: CustomerUpdate | unknown) {
  requirePermission(ctx, "customers.manage");
  const data = customerUpdateSchema.parse(input);
  return getDb().transaction(async (tx) => {
    const existing = await tx.query.customers.findFirst({ where: eq(s.customers.id, id) });
    if (!existing) throw notFound("Customer");
    const clash = await tx
      .select({ id: s.customers.id })
      .from(s.customers)
      .where(and(sql`lower(${s.customers.email}) = ${data.email}`, ne(s.customers.id, id)));
    if (clash.length) throw conflict("Another customer already uses that email address.");

    const [updated] = await tx.update(s.customers).set(data).where(eq(s.customers.id, id)).returning();
    const changed = Object.keys(data).filter(
      (k) => (existing as Record<string, unknown>)[k] !== (data as Record<string, unknown>)[k],
    );
    // Log which fields changed, not their values (keeps PII out of the audit payload).
    if (changed.length) {
      await recordEvent(tx, { entityType: "customer", entityId: id, type: "customer.updated", ...actorFields(ctx), payload: { fields: changed, via: ctx.via } });
    }
    return updated!;
  });
}
