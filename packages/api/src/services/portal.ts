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
  petPhotoSchema,
  profileUpdateSchema,
  type KitStatus,
} from "@petwealth/domain";
import { and, desc, eq, getDb, inArray, schema as s, sql } from "@petwealth/db";
import { recordEvent } from "../audit";
import { customerActor, type CustomerContext } from "../context";
import { conflict, invalid, notFound } from "../errors";
import { BreedAvatarError } from "@petwealth/integrations/ai";
import { breedAvatarRequestSchema, ensureBreedAvatar, syncPetAvatar, type BreedAvatarOptions } from "./breed-avatars";
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
  const db = getDb();
  const pets = await db.query.pets.findMany({ where: eq(s.pets.customerId, ctx.customerId), orderBy: desc(s.pets.createdAt) });
  const counts = pets.length
    ? await db
        .select({ petId: s.kits.petId, n: sql<number>`count(*)`.mapWith(Number) })
        .from(s.kits)
        .where(inArray(s.kits.petId, pets.map((p) => p.id)))
        .groupBy(s.kits.petId)
    : [];
  const byPet = new Map(counts.map((c) => [c.petId, c.n]));
  return pets.map((p) => ({ ...p, kitCount: byPet.get(p.id) ?? 0 }));
}

export async function createPet(ctx: CustomerContext, input: unknown) {
  const data = petCreateSchema.parse(input);
  const pet = await getDb().transaction(async (tx) => {
    const [pet] = await tx.insert(s.pets).values({ ...data, customerId: ctx.customerId }).returning();
    await recordEvent(tx, { entityType: "pet", entityId: pet!.id, type: "pet.created", ...customerActor(ctx), payload: { species: data.species } });
    return pet!;
  });
  return { ...pet, photoUrl: await syncPetAvatar(pet.id) };
}

/** My Information: name, phone, text alerts and the default shipping address. */
export async function updateMyProfile(ctx: CustomerContext, input: unknown) {
  const data = profileUpdateSchema.parse(input);
  return getDb().transaction(async (tx) => {
    const [customer] = await tx
      .update(s.customers)
      .set({
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone.startsWith("+") ? data.phone : `+1${data.phone.slice(-10)}`,
        smsOptIn: data.smsOptIn,
      })
      .where(eq(s.customers.id, ctx.customerId))
      .returning();
    const current = await tx.query.addresses.findFirst({
      where: and(eq(s.addresses.customerId, ctx.customerId), eq(s.addresses.isDefault, true)),
    });
    const a = data.address;
    const same =
      current &&
      current.line1 === a.line1 &&
      (current.line2 ?? null) === a.line2 &&
      current.city === a.city &&
      current.region === a.region &&
      current.postalCode === a.postalCode;
    // Keep old addresses (past orders and mailers point at them); add a new default instead.
    if (!same) {
      await tx.update(s.addresses).set({ isDefault: false }).where(eq(s.addresses.customerId, ctx.customerId));
      await tx.insert(s.addresses).values({ customerId: ctx.customerId, ...a, isDefault: true });
    }
    await recordEvent(tx, {
      entityType: "customer",
      entityId: ctx.customerId,
      type: "customer.profile_updated",
      ...customerActor(ctx),
      payload: { addressChanged: !same, smsOptIn: data.smsOptIn },
    });
    return customer!;
  });
}

async function myPet(ctx: CustomerContext, petId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(petId)) throw notFound("Pet");
  const pet = await getDb().query.pets.findFirst({ where: and(eq(s.pets.id, petId), eq(s.pets.customerId, ctx.customerId)) });
  if (!pet) throw notFound("Pet");
  return pet;
}

/** One of the customer's pets, with how many kits it has (a pet with kits can't be removed or change species). */
export async function getMyPet(ctx: CustomerContext, petId: string) {
  const pet = await myPet(ctx, petId);
  const kitCount = await getDb().$count(s.kits, eq(s.kits.petId, pet.id));
  return { ...pet, kitCount };
}

export async function updateMyPet(ctx: CustomerContext, petId: string, input: unknown) {
  const pet = await myPet(ctx, petId);
  const data = petCreateSchema.parse(input);
  const updated = await getDb().transaction(async (tx) => {
    if (data.species !== pet.species && (await tx.$count(s.kits, eq(s.kits.petId, pet.id)))) {
      throw invalid(`${pet.name} already has a ${pet.species} kit, so the species can't change.`);
    }
    const [updated] = await tx.update(s.pets).set(data).where(eq(s.pets.id, pet.id)).returning();
    await recordEvent(tx, { entityType: "pet", entityId: pet.id, type: "pet.updated", ...customerActor(ctx), payload: {} });
    return updated!;
  });
  // A new breed brings its own picture, unless the customer chose a photo.
  return { ...updated, photoUrl: await syncPetAvatar(pet.id) };
}

/**
 * The breed picture for the pet form, generated the first time anyone picks
 * this breed. Null for breeds outside the picker list or if drawing it failed.
 */
export async function previewBreedAvatar(_ctx: CustomerContext, input: unknown, opts: BreedAvatarOptions = {}): Promise<{ url: string | null; failed: boolean }> {
  const { species, breed } = breedAvatarRequestSchema.parse(input);
  try {
    return { url: await ensureBreedAvatar(species, breed, opts), failed: false };
  } catch (e) {
    if (!(e instanceof BreedAvatarError)) throw e;
    console.warn(`[breed-avatar] ${species}/${breed}: ${e.message}`);
    return { url: null, failed: true };
  }
}

/** Remove a pet that never had a kit (e.g. added by mistake). */
export async function deleteMyPet(ctx: CustomerContext, petId: string) {
  const pet = await myPet(ctx, petId);
  return getDb().transaction(async (tx) => {
    if (await tx.$count(s.kits, eq(s.kits.petId, pet.id))) {
      throw conflict(`${pet.name} has test kits, so the profile is kept with their results.`);
    }
    await tx.delete(s.pets).where(eq(s.pets.id, pet.id));
    await recordEvent(tx, { entityType: "pet", entityId: pet.id, type: "pet.deleted", ...customerActor(ctx), payload: { name: pet.name } });
  });
}

/** Save a pet photo (a data URL, already resized in the browser). */
export async function setMyPetPhoto(ctx: CustomerContext, petId: string, dataUrl: unknown) {
  const pet = await myPet(ctx, petId);
  const url = petPhotoSchema.parse(dataUrl);
  const mimeType = url.slice(5, url.indexOf(";"));
  const contentBase64 = url.slice(url.indexOf(",") + 1);
  return getDb().transaction(async (tx) => {
    await tx
      .insert(s.petPhotos)
      .values({ petId: pet.id, mimeType, contentBase64 })
      .onConflictDoUpdate({ target: s.petPhotos.petId, set: { mimeType, contentBase64, updatedAt: new Date() } });
    // Version in the URL so browsers pick up a new photo straight away.
    const photoUrl = `/api/pets/${pet.id}/photo?v=${Date.now().toString(36)}`;
    await tx.update(s.pets).set({ photoUrl }).where(eq(s.pets.id, pet.id));
    await recordEvent(tx, { entityType: "pet", entityId: pet.id, type: "pet.photo_updated", ...customerActor(ctx), payload: {} });
    return { photoUrl };
  });
}

/** Remove the customer's own photo and go back to the breed picture (drawing it if needed). */
export async function removeMyPetPhoto(ctx: CustomerContext, petId: string, opts: BreedAvatarOptions = {}): Promise<{ photoUrl: string | null }> {
  const pet = await myPet(ctx, petId);
  await getDb().transaction(async (tx) => {
    await tx.delete(s.petPhotos).where(eq(s.petPhotos.petId, pet.id));
    await tx.update(s.pets).set({ photoUrl: null }).where(eq(s.pets.id, pet.id));
    await recordEvent(tx, { entityType: "pet", entityId: pet.id, type: "pet.photo_removed", ...customerActor(ctx), payload: {} });
  });
  try {
    await ensureBreedAvatar(pet.species, pet.breed, opts);
  } catch (e) {
    if (!(e instanceof BreedAvatarError)) throw e;
    console.warn(`[breed-avatar] ${pet.species}/${pet.breed}: ${e.message}`);
  }
  return { photoUrl: await syncPetAvatar(pet.id) };
}

/** Photo bytes for the owner only. */
export async function getMyPetPhoto(ctx: CustomerContext, petId: string) {
  const pet = await myPet(ctx, petId);
  const [photo] = await getDb().select().from(s.petPhotos).where(eq(s.petPhotos.petId, pet.id));
  if (!photo) throw notFound("Photo");
  return { mimeType: photo.mimeType, content: Buffer.from(photo.contentBase64, "base64") };
}

/**
 * Delete account, as the old app did. Deleted: name, phone, email, pets and
 * their photos, and the login. Kept: kits and their lab results (no longer
 * tied to a name or pet), orders and the addresses they shipped to, for the
 * team's records. The customer row stays, scrubbed, so orders still add up.
 * The caller deletes the Clerk user after this succeeds.
 */
export async function deleteMyAccount(ctx: CustomerContext, input: { confirm: unknown }) {
  if (input.confirm !== "DELETE") throw invalid("Type DELETE to confirm.");
  return getDb().transaction(async (tx) => {
    const [customer] = await tx.select().from(s.customers).where(eq(s.customers.id, ctx.customerId)).for("update");
    if (!customer || customer.deletedAt) throw notFound("Account");
    const pets = await tx.select({ id: s.pets.id }).from(s.pets).where(eq(s.pets.customerId, customer.id));
    // Deleting pets unlinks their kits (pet_id set null) and removes photos (cascade).
    if (pets.length) await tx.delete(s.pets).where(eq(s.pets.customerId, customer.id));
    await tx
      .update(s.notifications)
      .set({ status: "skipped", error: "Account deleted" })
      .where(and(eq(s.notifications.customerId, customer.id), eq(s.notifications.status, "queued")));
    await tx
      .update(s.customers)
      .set({
        email: `deleted+${customer.id}@deleted.invalid`,
        firstName: null,
        lastName: null,
        phone: null,
        smsOptIn: false,
        clerkUserId: null,
        // A future Shopify purchase starts a fresh account instead of landing here.
        shopifyCustomerId: null,
        status: "disabled",
        deletedAt: new Date(),
      })
      .where(eq(s.customers.id, customer.id));
    await recordEvent(tx, {
      entityType: "customer",
      entityId: customer.id,
      type: "customer.deleted",
      actorType: "customer",
      actorId: customer.id,
      actorLabel: "customer (deleted)",
      payload: { petsDeleted: pets.length },
    });
    return { clerkUserId: customer.clerkUserId, petsDeleted: pets.length };
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
