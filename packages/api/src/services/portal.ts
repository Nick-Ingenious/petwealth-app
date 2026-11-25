/**
 * Customer portal services. Every function takes a CustomerContext and scopes
 * all reads/writes to `ctx.customerId` — never to an id from the request — so a
 * customer can only ever see or change their own pets, kits and labels.
 */
import {
  KIT_STATUS_META,
  onboardingSchema,
  parseKitCode,
  petCreateSchema,
  type KitStatus,
} from "@petwealth/domain";
import { and, desc, eq, getDb, inArray, schema as s, sql } from "@petwealth/db";
import { recordEvent } from "../audit";
import { customerActor, type CustomerContext } from "../context";
import { conflict, invalid, notFound } from "../errors";
import { changeKitStatus } from "./kits";
import { registerKitsForCustomer, type ReturnOptions } from "./returns";

// ── Identity ───────────────────────────────────────────────────────────

/**
 * Resolve a verified customer login to a customer row: by Clerk id, then by
 * email (linking a Shopify-created customer on first sign-in), else create one.
 * Returns null for disabled accounts.
 */
export async function resolveCustomerContext(identity: { clerkUserId: string | null; email: string }): Promise<CustomerContext | null> {
  const email = identity.email.trim().toLowerCase();
  const db = getDb();
  let customer =
    (identity.clerkUserId && (await db.query.customers.findFirst({ where: eq(s.customers.clerkUserId, identity.clerkUserId) }))) ||
    (await db.query.customers.findFirst({ where: sql`lower(${s.customers.email}) = ${email}` }));

  if (customer && identity.clerkUserId && customer.clerkUserId && customer.clerkUserId !== identity.clerkUserId) return null;
  if (customer?.status === "disabled") return null;

  if (!customer) {
    [customer] = await db
      .insert(s.customers)
      .values({ email, clerkUserId: identity.clerkUserId })
      .onConflictDoNothing()
      .returning();
    customer ??= await db.query.customers.findFirst({ where: sql`lower(${s.customers.email}) = ${email}` });
  } else if (identity.clerkUserId && !customer.clerkUserId) {
    [customer] = await db.update(s.customers).set({ clerkUserId: identity.clerkUserId }).where(eq(s.customers.id, customer.id)).returning();
  }
  if (!customer) return null;
  return { kind: "customer", customerId: customer.id, email: customer.email, needsOnboarding: !customer.onboardedAt };
}

// ── Profile & pets ─────────────────────────────────────────────────────

export async function getProfile(ctx: CustomerContext) {
  const customer = await getDb().query.customers.findFirst({
    where: eq(s.customers.id, ctx.customerId),
    with: { addresses: { orderBy: [desc(s.addresses.isDefault), desc(s.addresses.createdAt)] } },
  });
  if (!customer) throw notFound("Account");
  return customer;
}

export async function completeOnboarding(ctx: CustomerContext, input: unknown) {
  const data = onboardingSchema.parse(input);
  return getDb().transaction(async (tx) => {
    const hasAddress = (await tx.$count(s.addresses, eq(s.addresses.customerId, ctx.customerId))) > 0;
    if (!hasAddress && !data.address) throw invalid("Add your shipping address. We need it for your FedEx return code.");
    const [customer] = await tx
      .update(s.customers)
      .set({
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone.startsWith("+") ? data.phone : `+1${data.phone.slice(-10)}`,
        customerType: data.customerType,
        smsOptIn: data.smsOptIn,
        onboardedAt: sql`coalesce(${s.customers.onboardedAt}, now())`,
      })
      .where(eq(s.customers.id, ctx.customerId))
      .returning();
    if (data.address) {
      await tx.update(s.addresses).set({ isDefault: false }).where(eq(s.addresses.customerId, ctx.customerId));
      await tx.insert(s.addresses).values({ customerId: ctx.customerId, ...data.address, isDefault: true });
    }
    await recordEvent(tx, {
      entityType: "customer",
      entityId: ctx.customerId,
      type: "customer.onboarded",
      ...customerActor(ctx),
      payload: { customerType: data.customerType, smsOptIn: data.smsOptIn },
    });
    return customer!;
  });
}

export async function listMyPets(ctx: CustomerContext) {
  return getDb().query.pets.findMany({ where: eq(s.pets.customerId, ctx.customerId), orderBy: desc(s.pets.createdAt) });
}

export async function createPet(ctx: CustomerContext, input: unknown) {
  const data = petCreateSchema.parse(input);
  return getDb().transaction(async (tx) => {
    const [pet] = await tx.insert(s.pets).values({ ...data, customerId: ctx.customerId }).returning();
    await recordEvent(tx, { entityType: "pet", entityId: pet!.id, type: "pet.created", ...customerActor(ctx), payload: { species: data.species } });
    return pet!;
  });
}

// ── Kits ───────────────────────────────────────────────────────────────

/** "Kit #1 ✓" check while typing/scanning: is this code usable by this customer? No side effects. */
export async function checkKitCode(ctx: CustomerContext, raw: string) {
  const parsed = parseKitCode(raw);
  if (!parsed) return { ok: false as const, message: "That doesn't look like a kit ID. It's printed under the QR code, e.g. FRES-001-937." };
  const kit = await getDb().query.kits.findFirst({ where: eq(s.kits.code, parsed.code) });
  if (kit && kit.customerId && kit.customerId !== ctx.customerId) {
    return { ok: false as const, message: "This kit is registered to another account. Contact support if it's yours." };
  }
  if (kit && !["ordered", "label_created", "shipped", "delivered"].includes(kit.status)) {
    return { ok: false as const, message: "This kit is already registered." };
  }
  return { ok: true as const, code: parsed.code, species: parsed.species, panel: parsed.panel };
}

export async function registerMyKits(ctx: CustomerContext, input: unknown, opts: ReturnOptions = {}) {
  return registerKitsForCustomer(ctx.customerId, input, customerActor(ctx), opts);
}

/** The journey steps shown on a kit: Activate → Collect → Pack & ship → Results. */
export type JourneyStep = "activate" | "collect" | "ship" | "results";

export function journeyStepFor(status: KitStatus): { step: JourneyStep; done: JourneyStep[] } {
  if (["ordered", "label_created", "shipped", "delivered", "activated"].includes(status)) return { step: "activate", done: [] };
  if (status === "assigned") return { step: "collect", done: ["activate"] };
  if (status === "sample_collected") return { step: "ship", done: ["activate", "collect"] };
  if (status === "completed") return { step: "results", done: ["activate", "collect", "ship", "results"] };
  return { step: "results", done: ["activate", "collect", "ship"] }; // in transit, at lab, processing, rerun
}

const ACTIVE: KitStatus[] = ["activated", "assigned", "sample_collected", "in_transit", "received_at_lab", "processing", "rerun"];

/** Home screen: pets, kits in progress (with their return mailer), finished kits. */
export async function getPortalHome(ctx: CustomerContext) {
  const db = getDb();
  const [profile, pets, kits] = await Promise.all([
    getProfile(ctx),
    listMyPets(ctx),
    db.query.kits.findMany({
      where: and(eq(s.kits.customerId, ctx.customerId), sql`${s.kits.code} is not null`, inArray(s.kits.status, [...ACTIVE, "completed"])),
      orderBy: desc(s.kits.statusChangedAt),
      with: {
        pet: { columns: { id: true, name: true, species: true, photoUrl: true } },
        shipmentLinks: { with: { shipment: { columns: { id: true, direction: true, rmaNumber: true, status: true, labelFormat: true, createdAt: true } } } },
      },
    }),
  ]);
  // Kits whose lab results have been released, so the home list can open the report directly.
  const completedIds = kits.filter((k) => k.status === "completed").map((k) => k.id);
  const withResults = new Set(
    completedIds.length
      ? (
          await db
            .selectDistinct({ kitId: s.labResults.kitId })
            .from(s.labResults)
            .where(and(inArray(s.labResults.kitId, completedIds), eq(s.labResults.status, "released")))
        ).map((r) => r.kitId)
      : [],
  );
  const shape = (k: (typeof kits)[number]) => ({
    id: k.id,
    code: k.code!,
    species: k.species,
    panel: k.panel,
    status: k.status,
    statusLabel: KIT_STATUS_META[k.status].label,
    statusChangedAt: k.statusChangedAt,
    activatedAt: k.activatedAt,
    completedAt: k.completedAt,
    hasResults: withResults.has(k.id),
    pet: k.pet,
    journey: journeyStepFor(k.status),
    mailer: k.shipmentLinks.map((l) => l.shipment).filter((x) => x.direction === "return").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
  });
  return {
    profile: { firstName: profile.firstName, email: profile.email, needsOnboarding: !profile.onboardedAt, hasAddress: profile.addresses.length > 0 },
    pets,
    activeKits: kits.filter((k) => k.status !== "completed").map(shape),
    completedKits: kits.filter((k) => k.status === "completed").map(shape),
  };
}

export async function getMyKit(ctx: CustomerContext, rawCode: string) {
  const parsed = parseKitCode(rawCode);
  if (!parsed) throw notFound("Kit");
  const home = await getPortalHome(ctx);
  const kit = [...home.activeKits, ...home.completedKits].find((k) => k.code === parsed.code);
  if (!kit) throw notFound("Kit");
  const siblings = kit.mailer
    ? (
        await getDb()
          .select({ code: s.kits.code, petName: s.pets.name })
          .from(s.shipmentKits)
          .innerJoin(s.kits, eq(s.kits.id, s.shipmentKits.kitId))
          .leftJoin(s.pets, eq(s.pets.id, s.kits.petId))
          .where(and(eq(s.shipmentKits.shipmentId, kit.mailer.id), eq(s.kits.customerId, ctx.customerId)))
      ).filter((x) => x.code !== kit.code)
    : [];
  return { ...kit, mailerKits: siblings, email: home.profile.email };
}

/** Customer taps "{pet}'s sample is collected". */
export async function markSampleCollected(ctx: CustomerContext, rawCode: string) {
  const parsed = parseKitCode(rawCode);
  if (!parsed) throw notFound("Kit");
  return getDb().transaction(async (tx) => {
    const [kit] = await tx
      .select()
      .from(s.kits)
      .where(and(eq(s.kits.code, parsed.code), eq(s.kits.customerId, ctx.customerId)))
      .for("update");
    if (!kit) throw notFound("Kit");
    if (kit.status === "sample_collected") return kit;
    if (kit.status !== "assigned") throw conflict("This kit is already on its way to the lab.");
    return changeKitStatus(tx, kit, "sample_collected", customerActor(ctx));
  });
}

/** The customer's own FedEx QR/label image. */
export async function getMyMailerLabel(ctx: CustomerContext, shipmentId: string) {
  const db = getDb();
  const shipment = await db.query.shipments.findFirst({
    where: and(eq(s.shipments.id, shipmentId), eq(s.shipments.customerId, ctx.customerId)),
    with: { label: true },
  });
  if (!shipment?.label) throw notFound("Label");
  return { mimeType: shipment.label.mimeType, content: Buffer.from(shipment.label.contentBase64, "base64"), rmaNumber: shipment.rmaNumber };
}
