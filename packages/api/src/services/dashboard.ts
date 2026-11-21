import { IN_PROGRESS_STATUSES, KIT_STATUSES, type KitStatus, type Panel, type Species } from "@petwealth/domain";
import { and, count, eq, getDb, gte, inArray, lte, ne, schema as s, sql } from "@petwealth/db";
import { z } from "zod";
import { requirePermission, type StaffContext } from "../context";

export const dashboardRangeSchema = z.object({
  days: z.coerce
    .number()
    .refine((d) => [7, 30, 90, 365].includes(d))
    .catch(30),
});

const pctChange = (cur: number, prev: number) => (prev === 0 ? null : Math.round(((cur - prev) / prev) * 100));

/**
 * Every number on the dashboard is computed here, from the same tables the
 * list pages read — so the dashboard and the lists can never disagree.
 */
export async function getDashboard(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "dashboard.view");
  const { days } = dashboardRangeSchema.parse(input ?? {});
  const db = getDb();
  const now = new Date();
  const from = new Date(now.getTime() - days * 86_400_000);
  const prevFrom = new Date(from.getTime() - days * 86_400_000);

  const ordersIn = (a: Date, b: Date) =>
    db
      .select({ n: count(), revenue: sql<number>`coalesce(sum(${s.orders.totalCents}), 0)::int` })
      .from(s.orders)
      .where(and(gte(s.orders.placedAt, a), lte(s.orders.placedAt, b), ne(s.orders.status, "refunded")));
  const customersIn = (a: Date, b: Date) =>
    db.select({ n: count() }).from(s.customers).where(and(gte(s.customers.createdAt, a), lte(s.customers.createdAt, b)));

  const bucket = days <= 7 ? "day" : days <= 90 ? "week" : "month";
  const [[cur], [prev], [newCust], [prevCust], [allCust], [inProgress], pipelineRows, series, byPanel] =
    await Promise.all([
      ordersIn(from, now),
      ordersIn(prevFrom, from),
      customersIn(from, now),
      customersIn(prevFrom, from),
      db.select({ n: count() }).from(s.customers),
      db.select({ n: count() }).from(s.kits).where(inArray(s.kits.status, [...IN_PROGRESS_STATUSES])),
      db.select({ status: s.kits.status, n: count() }).from(s.kits).groupBy(s.kits.status),
      db.execute<{ bucket: string; orders: number; revenue: number }>(sql`
        select to_char(b.bucket, 'YYYY-MM-DD') as bucket,
               count(o.id)::int as orders,
               coalesce(sum(o.total_cents), 0)::int as revenue
        from generate_series(date_trunc(${bucket}, ${from.toISOString()}::timestamptz),
                             date_trunc(${bucket}, ${now.toISOString()}::timestamptz),
                             ${`1 ${bucket}`}::interval) as b(bucket)
        left join ${s.orders} o
          on date_trunc(${bucket}, o.placed_at) = b.bucket and o.status <> 'refunded'
          and o.placed_at >= ${from.toISOString()}::timestamptz -- first bucket is partial; keeps totals equal to the KPI
        group by b.bucket order by b.bucket`),
      db
        .select({ species: s.kits.species, panel: s.kits.panel, n: count() })
        .from(s.kits)
        .where(and(gte(s.kits.createdAt, from), ne(s.kits.status, "cancelled")))
        .groupBy(s.kits.species, s.kits.panel),
    ]);

  const pipeline = Object.fromEntries(KIT_STATUSES.map((st) => [st, 0])) as Record<KitStatus, number>;
  for (const r of pipelineRows) pipeline[r.status] = r.n;

  return {
    range: { days, from: from.toISOString(), to: now.toISOString(), bucket },
    kpis: {
      orders: { value: cur?.n ?? 0, changePct: pctChange(cur?.n ?? 0, prev?.n ?? 0) },
      revenueCents: { value: cur?.revenue ?? 0, changePct: pctChange(cur?.revenue ?? 0, prev?.revenue ?? 0) },
      customers: { value: allCust?.n ?? 0, newInRange: newCust?.n ?? 0, changePct: pctChange(newCust?.n ?? 0, prevCust?.n ?? 0) },
      inProgressKits: { value: inProgress?.n ?? 0 },
    },
    pipeline,
    series: [...series].map((r) => ({ bucket: r.bucket, orders: Number(r.orders), revenueCents: Number(r.revenue) })),
    kitsByPanel: byPanel as { species: Species; panel: Panel; n: number }[],
  };
}
