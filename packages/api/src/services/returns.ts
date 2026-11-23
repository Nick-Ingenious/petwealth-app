/**
 * Kit registration and return shipping.
 *
 *   customer scans tubes + picks pets ──► registerKits
 *        │  (one DB transaction)            kits: → activated → assigned, linked to pet
 *        │                                  shipment: return mailer, status "pending", RMA number
 *        ▼
 *   createReturnLabel ──► carrier (FedEx / test) ──► QR code or label stored, status "label_created"
 *        │ on carrier failure: status "failed" + error; registration is kept; staff retry
 *        ▼
 *   refreshTracking (cron) ──► picked up → kits "in_transit"; delivered → awaiting lab scan
 *
 * Everything registered together ships in ONE mailer with ONE code (≤ 10 tubes).
 */
import {
  formatRma,
  kitRegistrationSchema,
  parseKitCode,
  SPECIES_LABEL,
  type KitStatus,
} from "@petwealth/domain";
import { and, asc, desc, eq, getDb, inArray, isNull, lt, or, schema as s, sql, type DbOrTx } from "@petwealth/db";
import { getCarrier, CarrierError, type Carrier, type TrackingUpdate } from "@petwealth/integrations/carrier";
import { recordEvent, type AuditActor } from "../audit";
import { labAddress } from "../config";
import { actorFields, requirePermission, type StaffContext } from "../context";
import { conflict, invalid, notFound } from "../errors";
import { changeKitStatus } from "./kits";

/** Kit statuses in which a tube can still be registered by a customer. */
const REGISTRABLE: readonly KitStatus[] = ["ordered", "label_created", "shipped", "delivered"];

const carrierActor = (c: Pick<Carrier, "name">): AuditActor => ({
  actorType: "integration",
  actorId: c.name,
  actorLabel: c.name === "fedex" ? "FedEx" : "Test carrier",
});

// ── Registration ───────────────────────────────────────────────────────

export interface RegistrationResult {
  shipmentId: string;
  rmaNumber: string;
  kits: { code: string; petName: string }[];
  label: { status: "label_created" | "failed"; error?: string };
}

/**
 * Link scanned kits to the customer's pets and open one return mailer for them.
 * Core logic shared by the customer portal (customer actor) and admin (staff actor).
 */
export async function registerKitsForCustomer(
  customerId: string,
  input: unknown,
  actor: AuditActor,
  opts: { carrier?: Carrier } = {},
): Promise<RegistrationResult> {
  const { kits: requested } = kitRegistrationSchema.parse(input);

  const created = await getDb().transaction(async (tx) => {
    const customer = await tx.query.customers.findFirst({
      where: eq(s.customers.id, customerId),
      with: { addresses: { orderBy: [desc(s.addresses.isDefault), desc(s.addresses.createdAt)] } },
    });
    if (!customer) throw notFound("Customer");
    if (!customer.addresses.length) throw invalid("Add a shipping address before registering kits — FedEx needs it for the return label.");

    const petIds = [...new Set(requested.map((r) => r.petId))];
    const pets = await tx.select().from(s.pets).where(and(inArray(s.pets.id, petIds), eq(s.pets.customerId, customerId)));
    const petById = new Map(pets.map((p) => [p.id, p]));

    const linked: { kitId: string; code: string; petName: string; orderId: string | null }[] = [];
    for (const r of requested) {
      const parsed = parseKitCode(r.kitCode)!; // schema already validated the format
      const pet = petById.get(r.petId);
      if (!pet) throw invalid(`Choose one of this customer's pets for ${r.kitCode}.`);
      if (pet.species !== parsed.species) {
        throw invalid(`${r.kitCode} is a ${SPECIES_LABEL[parsed.species].noun.toLowerCase()} kit, but ${pet.name} is a ${SPECIES_LABEL[pet.species].noun.toLowerCase()}.`);
      }

      let [kit] = await tx.select().from(s.kits).where(eq(s.kits.code, parsed.code)).for("update");
      if (kit) {
        if (kit.customerId && kit.customerId !== customerId) throw conflict(`${parsed.code} is already registered to another account. Contact support if this is your kit.`);
        if (!REGISTRABLE.includes(kit.status)) throw conflict(`${parsed.code} is already registered${kit.petId ? "" : " and in progress"}.`);
      } else {
        // Match the tube to one of the customer's ordered kits of the same type…
        [kit] = await tx
          .select()
          .from(s.kits)
          .where(
            and(
              eq(s.kits.customerId, customerId),
              isNull(s.kits.code),
              eq(s.kits.species, parsed.species),
              eq(s.kits.panel, parsed.panel),
              inArray(s.kits.status, [...REGISTRABLE]),
            ),
          )
          .orderBy(asc(s.kits.createdAt))
          .limit(1)
          .for("update", { skipLocked: true });
        if (kit) {
          [kit] = await tx.update(s.kits).set({ code: parsed.code }).where(eq(s.kits.id, kit.id)).returning();
        } else {
          // …or accept a kit we didn't sell through Shopify (vet, wholesale, gift).
          [kit] = await tx
            .insert(s.kits)
            .values({ code: parsed.code, customerId, species: parsed.species, panel: parsed.panel, status: "ordered" })
            .returning();
          await recordEvent(tx, { entityType: "kit", entityId: kit!.id, type: "kit.created", ...actor, payload: { source: "registration" } });
        }
      }

      [kit] = await tx.update(s.kits).set({ customerId, petId: pet.id }).where(eq(s.kits.id, kit!.id)).returning();
      kit = await changeKitStatus(tx, kit!, "activated", actor, { via: "registration" });
      kit = await changeKitStatus(tx, kit, "assigned", actor, { petName: pet.name });
      linked.push({ kitId: kit.id, code: parsed.code, petName: pet.name, orderId: kit.orderId });
    }

    const orderIds = [...new Set(linked.map((l) => l.orderId))];
    const [shipment] = await tx
      .insert(s.shipments)
      .values({ direction: "return", status: "pending", customerId, orderId: orderIds.length === 1 ? orderIds[0] : null })
      .returning();
    const rmaNumber = formatRma(shipment!.number!);
    await tx.update(s.shipments).set({ rmaNumber }).where(eq(s.shipments.id, shipment!.id));
    await tx.insert(s.shipmentKits).values(linked.map((l) => ({ shipmentId: shipment!.id, kitId: l.kitId })));
    await recordEvent(tx, {
      entityType: "shipment",
      entityId: shipment!.id,
      type: "shipment.created",
      ...actor,
      payload: { rmaNumber, direction: "return", kits: linked.map((l) => l.code) },
    });
    return { shipmentId: shipment!.id, rmaNumber, kits: linked.map(({ code, petName }) => ({ code, petName })) };
  });

  const label = await createReturnLabel(created.shipmentId, opts.carrier);
  return { ...created, label };
}

/** Staff registering kits on a customer's behalf (phone support, testing). */
export async function registerKitsAsStaff(ctx: StaffContext, customerId: string, input: unknown, opts: { carrier?: Carrier } = {}) {
  requirePermission(ctx, "kits.manage");
  return registerKitsForCustomer(customerId, input, actorFields(ctx), opts);
}

// ── Labels ─────────────────────────────────────────────────────────────

/**
 * Ask the carrier for the return label/QR. Never throws for carrier problems:
 * the shipment is marked "failed" with the reason so staff can retry, and the
 * customer's registration stands.
 */
export async function createReturnLabel(
  shipmentId: string,
  carrierOverride?: Carrier,
): Promise<{ status: "label_created" | "failed"; error?: string }> {
  const db = getDb();
  const shipment = await db.query.shipments.findFirst({
    where: eq(s.shipments.id, shipmentId),
    with: { kits: true, customer: { with: { addresses: { orderBy: [desc(s.addresses.isDefault), desc(s.addresses.createdAt)] } } } },
  });
  if (!shipment) throw notFound("Shipment");
  if (shipment.status !== "pending" && shipment.status !== "failed") throw conflict("This mailer already has a label.");
  const customer = shipment.customer;
  const address = customer?.addresses[0];
  if (!customer || !address) throw invalid("The customer has no shipping address.");

  let carrier: Carrier;
  try {
    carrier = carrierOverride ?? getCarrier();
  } catch (e) {
    return markLabelFailed(shipmentId, e instanceof Error ? e.message : String(e), { actorType: "system", actorId: null, actorLabel: "System" });
  }

  try {
    const result = await carrier.createReturnShipment({
      rmaNumber: shipment.rmaNumber!,
      from: {
        name: [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email,
        phone: customer.phone ?? "",
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        region: address.region,
        postalCode: address.postalCode,
        country: address.country,
      },
      to: labAddress(),
      customerEmail: customer.email,
      kitCount: shipment.kits.length,
      weightLbs: 1,
    });
    await db.transaction(async (tx) => {
      await tx
        .update(s.shipments)
        .set({ carrier: carrier.name, trackingNumber: result.trackingNumber, labelFormat: result.label.format, status: "label_created", error: null })
        .where(eq(s.shipments.id, shipmentId));
      await tx
        .insert(s.shipmentLabels)
        .values({ shipmentId, mimeType: result.label.mimeType, contentBase64: result.label.contentBase64 })
        .onConflictDoUpdate({ target: s.shipmentLabels.shipmentId, set: { mimeType: result.label.mimeType, contentBase64: result.label.contentBase64 } });
      await recordEvent(tx, {
        entityType: "shipment",
        entityId: shipmentId,
        type: "shipment.label_created",
        ...carrierActor(carrier),
        payload: { trackingNumber: result.trackingNumber, format: result.label.format, carrierReference: result.carrierReference ?? null },
      });
      // "Your FedEx code is ready" email, sent by the notification worker (2c).
      await tx.insert(s.notifications).values({ customerId: customer.id, channel: "email", template: "return_label_ready", status: "queued" });
    });
    return { status: "label_created" };
  } catch (e) {
    const message = e instanceof CarrierError ? e.message : `Unexpected error creating label: ${e instanceof Error ? e.message : String(e)}`;
    if (!(e instanceof CarrierError)) console.error("[returns] label creation failed", e);
    return markLabelFailed(shipmentId, message, carrierActor(carrier));
  }
}

async function markLabelFailed(shipmentId: string, error: string, actor: AuditActor) {
  await getDb().transaction(async (tx) => {
    await tx.update(s.shipments).set({ status: "failed", error }).where(eq(s.shipments.id, shipmentId));
    await recordEvent(tx, { entityType: "shipment", entityId: shipmentId, type: "shipment.label_failed", ...actor, payload: { error } });
  });
  return { status: "failed" as const, error };
}

export async function retryReturnLabel(ctx: StaffContext, shipmentId: string, opts: { carrier?: Carrier } = {}) {
  requirePermission(ctx, "kits.manage");
  return createReturnLabel(shipmentId, opts.carrier);
}

/** The stored QR/label image, for staff (customers get their own scoped route in the portal). */
export async function getShipmentLabel(ctx: StaffContext, shipmentId: string) {
  requirePermission(ctx, "kits.view");
  const label = await getDb().query.shipmentLabels.findFirst({ where: eq(s.shipmentLabels.shipmentId, shipmentId) });
  if (!label) throw notFound("Label");
  return { mimeType: label.mimeType, content: Buffer.from(label.contentBase64, "base64") };
}

// ── Tracking ───────────────────────────────────────────────────────────

const TRACK_EVERY_MS = 25 * 60_000;

export interface TrackingRunResult {
  checked: number;
  updated: number;
  kitsMoved: number;
  errors: string[];
}

/**
 * Poll the carrier for open shipments and move kits along. Run by the cron
 * every 30 minutes; safe to run more often (each shipment is polled at most
 * every 25 minutes) and idempotent.
 */
export async function refreshTracking(opts: { carrier?: Carrier; limit?: number; now?: Date } = {}): Promise<TrackingRunResult> {
  const carrier = opts.carrier ?? getCarrier();
  const now = opts.now ?? new Date();
  const db = getDb();
  const due = await db
    .select()
    .from(s.shipments)
    .where(
      and(
        inArray(s.shipments.status, ["label_created", "in_transit"]),
        eq(s.shipments.carrier, carrier.name),
        sql`${s.shipments.trackingNumber} is not null`,
        or(isNull(s.shipments.lastTrackedAt), lt(s.shipments.lastTrackedAt, new Date(now.getTime() - TRACK_EVERY_MS))),
      ),
    )
    .orderBy(sql`${s.shipments.lastTrackedAt} asc nulls first`)
    .limit(opts.limit ?? 100);

  const result: TrackingRunResult = { checked: due.length, updated: 0, kitsMoved: 0, errors: [] };
  if (!due.length) return result;

  let updates: TrackingUpdate[];
  try {
    updates = await carrier.track(due.map((d) => d.trackingNumber!));
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
    return result;
  }
  const byNumber = new Map(updates.map((u) => [u.trackingNumber, u]));

  for (const shipment of due) {
    const u = byNumber.get(shipment.trackingNumber!);
    try {
      const moved = await applyTrackingUpdate(shipment, u, carrierActor(carrier), now);
      if (moved.changed) result.updated++;
      result.kitsMoved += moved.kitsMoved;
    } catch (e) {
      result.errors.push(`${shipment.trackingNumber}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

type ShipmentRow = typeof s.shipments.$inferSelect;

async function applyTrackingUpdate(shipment: ShipmentRow, u: TrackingUpdate | undefined, actor: AuditActor, now: Date) {
  return getDb().transaction(async (tx) => {
    const base = { lastTrackedAt: now };
    if (!u || u.status === "unknown" || u.status === "label_created") {
      await tx.update(s.shipments).set({ ...base, statusDetail: u?.description ?? shipment.statusDetail }).where(eq(s.shipments.id, shipment.id));
      return { changed: false, kitsMoved: 0 };
    }
    const next = u.status === "delivered" ? "delivered" : u.status === "exception" ? "exception" : "in_transit";
    const changed = next !== shipment.status;
    await tx
      .update(s.shipments)
      .set({
        ...base,
        status: next,
        statusDetail: u.description,
        pickedUpAt: u.pickedUpAt ?? shipment.pickedUpAt,
        deliveredAt: u.deliveredAt ?? shipment.deliveredAt,
        lastCarrierEventAt: u.occurredAt ?? shipment.lastCarrierEventAt,
      })
      .where(eq(s.shipments.id, shipment.id));
    if (!changed) return { changed: false, kitsMoved: 0 };

    await recordEvent(tx, {
      entityType: "shipment",
      entityId: shipment.id,
      type: `shipment.${next}`,
      ...actor,
      payload: { trackingNumber: shipment.trackingNumber, detail: u.description },
    });
    const kitsMoved = await moveKitsForShipment(tx, shipment, next, actor);
    return { changed: true, kitsMoved };
  });
}

/** Which kit status a shipment milestone implies, by direction. */
const KIT_TARGET: Record<"outbound" | "return", Partial<Record<"in_transit" | "delivered", { to: KitStatus; from: KitStatus[] }>>> = {
  return: { in_transit: { to: "in_transit", from: ["assigned", "sample_collected"] } },
  outbound: {
    in_transit: { to: "shipped", from: ["ordered", "label_created"] },
    delivered: { to: "delivered", from: ["shipped"] },
  },
};

async function moveKitsForShipment(tx: DbOrTx, shipment: ShipmentRow, next: string, actor: AuditActor) {
  const kitIds = (await tx.select({ kitId: s.shipmentKits.kitId }).from(s.shipmentKits).where(eq(s.shipmentKits.shipmentId, shipment.id))).map((r) => r.kitId);
  if (!kitIds.length) return 0;
  const kits = await tx.select().from(s.kits).where(inArray(s.kits.id, kitIds)).for("update");
  // A return delivered before we saw it picked up still means the kits travelled.
  const milestone = shipment.direction === "return" && next === "delivered" ? "in_transit" : next;
  const target = KIT_TARGET[shipment.direction][milestone as "in_transit" | "delivered"];
  let moved = 0;
  for (const kit of kits) {
    if (target && target.from.includes(kit.status)) {
      await changeKitStatus(tx, kit, target.to, actor, { trackingNumber: shipment.trackingNumber, rmaNumber: shipment.rmaNumber });
      moved++;
    }
    if (next === "exception") {
      await recordEvent(tx, { entityType: "kit", entityId: kit.id, type: "kit.shipping_exception", ...actor, payload: { trackingNumber: shipment.trackingNumber } });
    }
  }
  return moved;
}

// ── Queries ────────────────────────────────────────────────────────────

/** Return mailers for a customer, newest first (admin customer page). */
export async function listCustomerShipments(ctx: StaffContext, customerId: string) {
  requirePermission(ctx, "kits.view");
  return getDb().query.shipments.findMany({
    where: eq(s.shipments.customerId, customerId),
    orderBy: desc(s.shipments.createdAt),
    with: { kits: { with: { kit: { columns: { id: true, code: true, species: true, panel: true, status: true }, with: { pet: { columns: { name: true } } } } } } },
    limit: 50,
  });
}

/** Shipments that need a human: failed labels and carrier exceptions. */
export async function listShipmentProblems(ctx: StaffContext) {
  requirePermission(ctx, "kits.view");
  return getDb().query.shipments.findMany({
    where: inArray(s.shipments.status, ["failed", "exception"]),
    orderBy: desc(s.shipments.updatedAt),
    with: { customer: { columns: { id: true, email: true, firstName: true, lastName: true } } },
    limit: 50,
  });
}

