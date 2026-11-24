/**
 * Kit services. `changeKitStatus` is the ONLY function in the codebase that
 * updates `kits.status` — it validates the transition, stamps milestones,
 * writes the audit event, and queues the customer email atomically.
 */
import {
  KIT_STATUS_META,
  KitTransitionError,
  assertKitTransition,
  kitListQuerySchema,
  kitTransitionSchema,
  milestoneFieldFor,
  notificationForStatus,
  receiveKitSchema,
  type KitStatus,
} from "@petwealth/domain";
import { and, count, desc, eq, getDb, ilike, inArray, or, schema as s, sql, type DbOrTx } from "@petwealth/db";
import type { z } from "zod";
import { recordEvent, type AuditActor } from "../audit";
import { actorFields, requirePermission, type StaffContext } from "../context";
import { AppError, conflict, notFound } from "../errors";
import { likePattern, offsetOf, toPage } from "../pagination";

export async function listKits(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "kits.view");
  const q = kitListQuerySchema.parse(input ?? {});
  const db = getDb();
  const where = and(
    q.status ? eq(s.kits.status, q.status) : undefined,
    q.q
      ? or(
          ilike(s.kits.code, likePattern(q.q)),
          ilike(s.customers.email, likePattern(q.q)),
          ilike(sql`${s.customers.firstName} || ' ' || ${s.customers.lastName}`, likePattern(q.q)),
          ilike(s.pets.name, likePattern(q.q)),
        )
      : undefined,
  );
  const base = db
    .select({
      id: s.kits.id,
      code: s.kits.code,
      species: s.kits.species,
      panel: s.kits.panel,
      status: s.kits.status,
      statusChangedAt: s.kits.statusChangedAt,
      createdAt: s.kits.createdAt,
      activatedAt: s.kits.activatedAt,
      customer: {
        id: s.customers.id,
        email: s.customers.email,
        firstName: s.customers.firstName,
        lastName: s.customers.lastName,
      },
      pet: { id: s.pets.id, name: s.pets.name, species: s.pets.species },
    })
    .from(s.kits)
    .leftJoin(s.customers, eq(s.kits.customerId, s.customers.id))
    .leftJoin(s.pets, eq(s.kits.petId, s.pets.id))
    .where(where);

  const [items, [{ total } = { total: 0 }]] = await Promise.all([
    base.orderBy(desc(s.kits.statusChangedAt)).limit(q.pageSize).offset(offsetOf(q)),
    db
      .select({ total: count() })
      .from(s.kits)
      .leftJoin(s.customers, eq(s.kits.customerId, s.customers.id))
      .leftJoin(s.pets, eq(s.kits.petId, s.pets.id))
      .where(where),
  ]);
  return toPage(
    items.map((k) => ({ ...k, pet: k.pet?.id ? k.pet : null, customer: k.customer?.id ? k.customer : null })),
    total,
    q,
  );
}

export async function getKit(ctx: StaffContext, code: string) {
  requirePermission(ctx, "kits.view");
  const db = getDb();
  const kit = await db.query.kits.findFirst({
    where: eq(s.kits.code, code.toUpperCase()),
    with: {
      customer: true,
      pet: true,
      order: true,
      shipmentLinks: { with: { shipment: true } },
      labResults: { orderBy: desc(s.labResults.reportedAt) },
    },
  });
  if (!kit) throw notFound("Kit");
  const { shipmentLinks, ...rest } = kit;
  const shipments = shipmentLinks
    .map((l) => l.shipment)
    .sort((a, b) => a.direction.localeCompare(b.direction) || b.createdAt.getTime() - a.createdAt.getTime());
  // The kit's own events plus those of the mailers it travelled in.
  const timeline = await db
    .select()
    .from(s.events)
    .where(
      or(
        and(eq(s.events.entityType, "kit"), eq(s.events.entityId, kit.id)),
        shipments.length ? and(eq(s.events.entityType, "shipment"), inArray(s.events.entityId, shipments.map((x) => x.id))) : undefined,
      ),
    )
    .orderBy(desc(s.events.occurredAt));
  return { ...rest, shipments, timeline };
}

type KitRow = typeof s.kits.$inferSelect;

/** Validate + apply a status change inside an existing transaction. */
export async function changeKitStatus(
  tx: DbOrTx,
  kit: KitRow,
  to: KitStatus,
  actor: AuditActor,
  payload: Record<string, unknown> = {},
): Promise<KitRow> {
  try {
    assertKitTransition(kit.status, to);
  } catch (e) {
    if (e instanceof KitTransitionError) throw conflict(e.message);
    throw e;
  }
  const now = new Date();
  const milestone = milestoneFieldFor(to);
  const [updated] = await tx
    .update(s.kits)
    .set({ status: to, statusChangedAt: now, ...(milestone ? { [milestone]: now } : {}) })
    .where(and(eq(s.kits.id, kit.id), eq(s.kits.status, kit.status))) // optimistic guard
    .returning();
  if (!updated) throw conflict("This kit was just updated by someone else. Refresh and try again.");

  await recordEvent(tx, {
    entityType: "kit",
    entityId: kit.id,
    type: "kit.status_changed",
    ...actor,
    payload: { from: kit.status, to, ...payload },
  });

  // Queue the customer email. The notifications cron sends it a few minutes
  // later, combining kits that changed together (e.g. one mailer) into one email.
  const template = notificationForStatus(to);
  if (template && kit.customerId) {
    await tx.insert(s.notifications).values({ customerId: kit.customerId, kitId: kit.id, channel: "email", template });
  }
  return updated;
}

async function lockKitByCode(tx: DbOrTx, code: string): Promise<KitRow> {
  const [kit] = await tx.select().from(s.kits).where(eq(s.kits.code, code)).for("update");
  if (!kit) throw new AppError(404, "kit_not_found", `No kit found with ID ${code}. Check the label and try again.`);
  return kit;
}

export async function transitionKit(ctx: StaffContext, input: z.input<typeof kitTransitionSchema>) {
  const { kitCode, to, note } = kitTransitionSchema.parse(input);
  requirePermission(ctx, to === "received_at_lab" ? "kits.receive" : "kits.manage");
  return getDb().transaction(async (tx) => {
    const kit = await lockKitByCode(tx, kitCode);
    return changeKitStatus(tx, kit, to, actorFields(ctx), { via: ctx.via, ...(note ? { note } : {}) });
  });
}

/** Lab check-in from the Receive Kits scanner. Returns warnings the scanner UI should show. */
export async function receiveKit(ctx: StaffContext, input: z.input<typeof receiveKitSchema>) {
  requirePermission(ctx, "kits.receive");
  const { kitCode } = receiveKitSchema.parse(input);
  return getDb().transaction(async (tx) => {
    const kit = await lockKitByCode(tx, kitCode);
    if (kit.status === "received_at_lab") {
      const when = kit.receivedAt
        ? ` on ${kit.receivedAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" })} ET`
        : "";
      throw conflict(`${kitCode} was already received${when}.`);
    }
    const updated = await changeKitStatus(tx, kit, "received_at_lab", actorFields(ctx), { via: ctx.via });
    const pet = kit.petId ? await tx.query.pets.findFirst({ where: eq(s.pets.id, kit.petId) }) : null;
    const warnings: string[] = [];
    if (!pet) warnings.push("No pet is registered to this kit yet. Contact the customer before processing.");
    if (["shipped", "delivered"].includes(kit.status)) warnings.push("Customer never activated this kit.");
    return { kit: updated, pet: pet ?? null, warnings };
  });
}

/** Most recent lab check-ins, for the Receive Kits page. */
export async function listRecentlyReceived(ctx: StaffContext, limit = 25) {
  requirePermission(ctx, "kits.receive");
  return getDb()
    .select({
      code: s.kits.code,
      species: s.kits.species,
      panel: s.kits.panel,
      status: s.kits.status,
      receivedAt: s.kits.receivedAt,
      petName: s.pets.name,
    })
    .from(s.kits)
    .leftJoin(s.pets, eq(s.kits.petId, s.pets.id))
    .where(sql`${s.kits.receivedAt} is not null`)
    .orderBy(desc(s.kits.receivedAt))
    .limit(limit);
}

export const kitStatusLabel = (status: KitStatus) => KIT_STATUS_META[status].label;
