/** Customer portal services against a real database (RUN_DB_TESTS=1). */
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { formatKitCode } from "@petwealth/domain";
import { eq, getDb, schema as s } from "@petwealth/db";
import { TestCarrier } from "@petwealth/integrations/carrier";
import {
  checkKitCode,
  completeOnboarding,
  deleteMyAccount,
  createPet,
  deleteMyPet,
  getMyPet,
  getMyPetPhoto,
  getProfile,
  listMyPets,
  removeMyPetPhoto,
  setMyPetPhoto,
  updateMyPet,
  updateMyProfile,
  getMyKit,
  getMyMailerLabel,
  getPortalHome,
  markSampleCollected,
  registerMyKits,
  resolveCustomerContext,
} from "./services/portal";

const run = process.env.RUN_DB_TESTS === "1";
const email = () => `portal.${randomInt(1e9)}@example.com`;
const profile = (address = true) => ({
  firstName: "Nina",
  lastName: "Park",
  phone: "4155550101",
  customerType: "pet_parent",
  smsOptIn: true,
  ...(address ? { address: { line1: "1 Main St", city: "Austin", region: "TX", postalCode: "78701" } } : {}),
});
const felix = { name: "Felix", species: "cat", dateOfBirth: "2026-04-06", weightLbs: 7, breed: "American Bobtail", sex: "male", spayedNeutered: "yes" };

async function onboarded() {
  const ctx = (await resolveCustomerContext({ clerkUserId: `user_${randomUUID()}`, email: email() }))!;
  await completeOnboarding(ctx, profile());
  const pet = await createPet(ctx, felix);
  return { ctx: { ...ctx, needsOnboarding: false }, pet };
}

describe.skipIf(!run)("customer portal (db)", () => {
  afterAll(async () => {
    await getDb().$client.end();
  });

  it("links a first sign-in to the customer Shopify created, by email", async () => {
    const e = email();
    const [shopify] = await getDb().insert(s.customers).values({ email: e, firstName: "Shop" }).returning();
    const ctx = await resolveCustomerContext({ clerkUserId: "user_link_" + randomUUID(), email: e.toUpperCase() });
    expect(ctx).toMatchObject({ customerId: shopify!.id, needsOnboarding: true });
  });

  it("refuses disabled accounts and a different login claiming a linked account", async () => {
    const e = email();
    const first = await resolveCustomerContext({ clerkUserId: "user_a_" + randomUUID(), email: e });
    expect(await resolveCustomerContext({ clerkUserId: "user_b_" + randomUUID(), email: e })).toBeNull();
    await getDb().update(s.customers).set({ status: "disabled" }).where(eq(s.customers.id, first!.customerId));
    expect(await resolveCustomerContext({ clerkUserId: null, email: e })).toBeNull();
  });

  it("requires a shipping address at onboarding when none is on file", async () => {
    const ctx = (await resolveCustomerContext({ clerkUserId: null, email: email() }))!;
    await expect(completeOnboarding(ctx, profile(false))).rejects.toMatchObject({ status: 422 });
    const c = await completeOnboarding(ctx, profile());
    expect(c).toMatchObject({ customerType: "pet_parent", phone: "+14155550101", smsOptIn: true });
    expect(c.onboardedAt).not.toBeNull();
  });

  it("walks a kit from registration to 'sample collected'", async () => {
    const { ctx, pet } = await onboarded();
    const code = formatKitCode("cat", "respiratory", 950, randomInt(1000));
    expect(await checkKitCode(ctx, code.toLowerCase())).toMatchObject({ ok: true, species: "cat", panel: "respiratory" });

    const res = await registerMyKits(ctx, { kits: [{ kitCode: code, petId: pet.id }] }, { carrier: new TestCarrier() });
    expect(res.label.status).toBe("label_created");

    const home = await getPortalHome(ctx);
    expect(home.activeKits).toHaveLength(1);
    expect(home.activeKits[0]).toMatchObject({ code, journey: { step: "collect" }, mailer: { rmaNumber: res.rmaNumber, status: "label_created" } });

    expect((await markSampleCollected(ctx, code)).status).toBe("sample_collected");
    expect((await getMyKit(ctx, code)).journey.step).toBe("ship");
    expect((await getMyMailerLabel(ctx, res.shipmentId)).mimeType).toBe("image/png");
  });

  it("never exposes another customer's kit or label", async () => {
    const a = await onboarded();
    const b = await onboarded();
    const code = formatKitCode("cat", "fecal", 951, randomInt(1000));
    const res = await registerMyKits(a.ctx, { kits: [{ kitCode: code, petId: a.pet.id }] }, { carrier: new TestCarrier() });

    await expect(getMyKit(b.ctx, code)).rejects.toMatchObject({ status: 404 });
    await expect(getMyMailerLabel(b.ctx, res.shipmentId)).rejects.toMatchObject({ status: 404 });
    await expect(markSampleCollected(b.ctx, code)).rejects.toMatchObject({ status: 404 });
    expect(await checkKitCode(b.ctx, code)).toMatchObject({ ok: false, message: expect.stringContaining("another account") });
    // and B can't register their kits to A's pet
    await expect(registerMyKits(b.ctx, { kits: [{ kitCode: formatKitCode("cat", "oral", 952, randomInt(1000)), petId: a.pet.id }] })).rejects.toMatchObject({ status: 422 });
  });
  it("updates My Information and keeps the old address", async () => {
    const { ctx } = await onboarded();
    await updateMyProfile(ctx, {
      firstName: "Nina",
      lastName: "Park-Lee",
      phone: "(512) 555-0199",
      smsOptIn: false,
      address: { line1: "9 Oak Ave", line2: "", city: "Denver", region: "co", postalCode: "80202" },
    });
    const p = await getProfile(ctx);
    expect(p).toMatchObject({ lastName: "Park-Lee", phone: "+15125550199", smsOptIn: false });
    expect(p.addresses.map((a) => [a.city, a.region, a.isDefault])).toEqual([
      ["Denver", "CO", true],
      ["Austin", "TX", false],
    ]);
    // Saving the same address again doesn't add another row.
    await updateMyProfile(ctx, { firstName: "Nina", lastName: "Park-Lee", phone: "5125550199", smsOptIn: false, address: { line1: "9 Oak Ave", city: "Denver", region: "CO", postalCode: "80202" } });
    expect((await getProfile(ctx)).addresses).toHaveLength(2);
    await expect(updateMyProfile(ctx, { firstName: "", lastName: "x", phone: "1", smsOptIn: false, address: {} })).rejects.toThrow();
  });

  it("edits, photographs and deletes pets, scoped to the owner", async () => {
    const a = await onboarded();
    const b = await onboarded();
    await updateMyPet(a.ctx, a.pet.id, { ...felix, name: "Felix II", weightLbs: "8.5" });
    expect(await getMyPet(a.ctx, a.pet.id)).toMatchObject({ name: "Felix II", weightLbs: 8.5, kitCount: 0 });
    await expect(getMyPet(b.ctx, a.pet.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateMyPet(b.ctx, a.pet.id, felix)).rejects.toMatchObject({ status: 404 });

    // Photo: stored, served to the owner only, removable.
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const { photoUrl } = await setMyPetPhoto(a.ctx, a.pet.id, png);
    expect(photoUrl).toMatch(new RegExp(`^/api/pets/${a.pet.id}/photo\\?v=`));
    expect((await getMyPetPhoto(a.ctx, a.pet.id)).mimeType).toBe("image/png");
    await expect(getMyPetPhoto(b.ctx, a.pet.id)).rejects.toMatchObject({ status: 404 });
    await expect(setMyPetPhoto(a.ctx, a.pet.id, "data:text/html;base64,PGgxPg==")).rejects.toThrow();
    await removeMyPetPhoto(a.ctx, a.pet.id);
    expect((await getMyPet(a.ctx, a.pet.id)).photoUrl).toBeNull();

    // A pet with a kit keeps its species and can't be deleted.
    await getDb().insert(s.kits).values({ code: formatKitCode("cat", "fecal", 953, randomInt(1000)), customerId: a.ctx.customerId, petId: a.pet.id, species: "cat", panel: "fecal", status: "assigned" });
    expect((await listMyPets(a.ctx)).find((p) => p.id === a.pet.id)?.kitCount).toBe(1);
    await expect(updateMyPet(a.ctx, a.pet.id, { ...felix, species: "dog", breed: "Beagle" })).rejects.toThrow(/species can't change/);
    await expect(deleteMyPet(a.ctx, a.pet.id)).rejects.toMatchObject({ status: 409 });

    // A pet without kits can be deleted.
    const extra = await createPet(a.ctx, { ...felix, name: "Oops" });
    await deleteMyPet(a.ctx, extra.id);
    await expect(getMyPet(a.ctx, extra.id)).rejects.toMatchObject({ status: 404 });
  });
  it("deletes an account: personal details and pets go, kits, results, orders and addresses stay", async () => {
    const { ctx, pet } = await onboarded();
    const db = getDb();
    await setMyPetPhoto(ctx, pet.id, "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");
    const before = await getProfile(ctx);
    const [order] = await db.insert(s.orders).values({ customerId: ctx.customerId, source: "manual", subtotalCents: 9900, totalCents: 9900, placedAt: new Date(), shippingAddressId: before.addresses[0]!.id }).returning();
    const [kit] = await db
      .insert(s.kits)
      .values({ code: formatKitCode("cat", "fecal", 954, randomInt(1000)), orderId: order!.id, customerId: ctx.customerId, petId: pet.id, species: "cat", panel: "fecal", status: "completed" })
      .returning();
    await db.insert(s.labResults).values({ kitId: kit!.id, status: "released", healthStatus: "clean", raw: {}, reportedAt: new Date(), releasedAt: new Date() });
    await db.insert(s.notifications).values({ customerId: ctx.customerId, kitId: kit!.id, channel: "email", template: "results_ready" });

    await expect(deleteMyAccount(ctx, { confirm: "delete" })).rejects.toThrow(/Type DELETE/);
    const out = await deleteMyAccount(ctx, { confirm: "DELETE" });
    expect(out.petsDeleted).toBe(1);

    const [c] = await db.select().from(s.customers).where(eq(s.customers.id, ctx.customerId));
    expect(c).toMatchObject({ firstName: null, lastName: null, phone: null, clerkUserId: null, shopifyCustomerId: null, smsOptIn: false, status: "disabled" });
    expect(c!.email).toMatch(/^deleted\+.*@deleted\.invalid$/);
    expect(c!.deletedAt).toBeInstanceOf(Date);
    expect(await db.select().from(s.pets).where(eq(s.pets.customerId, ctx.customerId))).toHaveLength(0);
    expect(await db.select().from(s.petPhotos).where(eq(s.petPhotos.petId, pet.id))).toHaveLength(0);
    // Kit, result, order and address stay; the kit no longer points at a pet.
    const [k] = await db.select().from(s.kits).where(eq(s.kits.id, kit!.id));
    expect(k).toMatchObject({ petId: null, status: "completed", orderId: order!.id });
    expect(await db.select().from(s.labResults).where(eq(s.labResults.kitId, kit!.id))).toHaveLength(1);
    expect(await db.select().from(s.addresses).where(eq(s.addresses.customerId, ctx.customerId))).toHaveLength(1);
    const [n] = await db.select().from(s.notifications).where(eq(s.notifications.kitId, kit!.id));
    expect(n!.status).toBe("skipped");
    // The old login can't get back in, and the same email starts fresh.
    expect(await resolveCustomerContext({ clerkUserId: "whatever", email: before.email })).not.toMatchObject({ customerId: ctx.customerId });
    await expect(deleteMyAccount(ctx, { confirm: "DELETE" })).rejects.toMatchObject({ status: 404 });
  });
});
