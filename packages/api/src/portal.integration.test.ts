/** Customer portal services against a real database (RUN_DB_TESTS=1). */
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { ALL_PERMISSIONS } from "@petwealth/domain";
import type { StaffContext } from "./context";
import { freshKitCode } from "./test-kit-codes";
import { and, eq, getDb, inArray, schema as s } from "@petwealth/db";
import { BreedAvatarError, type BreedAvatarGenerator } from "@petwealth/integrations/ai";
import { ensurePetBreedAvatar, getBreedAvatarImage, listBreedAvatars, redrawBreedAvatar } from "./services/breed-avatars";
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
  previewBreedAvatar,
  registerMyKits,
  resolveCustomerContext,
} from "./services/portal";

const run = process.env.RUN_DB_TESTS === "1";
/** Tests never call the real image model. */
const noPicture: BreedAvatarGenerator = async () => {
  throw new BreedAvatarError("image model not available in tests");
};
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
    const code = (await freshKitCode("cat", "respiratory"));
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
    const code = (await freshKitCode("cat", "fecal"));
    const res = await registerMyKits(a.ctx, { kits: [{ kitCode: code, petId: a.pet.id }] }, { carrier: new TestCarrier() });

    await expect(getMyKit(b.ctx, code)).rejects.toMatchObject({ status: 404 });
    await expect(getMyMailerLabel(b.ctx, res.shipmentId)).rejects.toMatchObject({ status: 404 });
    await expect(markSampleCollected(b.ctx, code)).rejects.toMatchObject({ status: 404 });
    expect(await checkKitCode(b.ctx, code)).toMatchObject({ ok: false, message: expect.stringContaining("another account") });
    // and B can't register their kits to A's pet
    await expect(registerMyKits(b.ctx, { kits: [{ kitCode: (await freshKitCode("cat", "oral")), petId: a.pet.id }] })).rejects.toMatchObject({ status: 422 });
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
    await removeMyPetPhoto(a.ctx, a.pet.id, { generate: noPicture });
    expect((await getMyPet(a.ctx, a.pet.id)).photoUrl).toBeNull();

    // A pet with a kit keeps its species and can't be deleted.
    await getDb().insert(s.kits).values({ code: (await freshKitCode("cat", "fecal")), customerId: a.ctx.customerId, petId: a.pet.id, species: "cat", panel: "fecal", status: "assigned" });
    expect((await listMyPets(a.ctx)).find((p) => p.id === a.pet.id)?.kitCount).toBe(1);
    await expect(updateMyPet(a.ctx, a.pet.id, { ...felix, species: "dog", breed: "Beagle" })).rejects.toThrow(/species can't change/);
    await expect(deleteMyPet(a.ctx, a.pet.id)).rejects.toMatchObject({ status: 409 });

    // A pet without kits can be deleted.
    const extra = await createPet(a.ctx, { ...felix, name: "Oops" });
    await deleteMyPet(a.ctx, extra.id);
    await expect(getMyPet(a.ctx, extra.id)).rejects.toMatchObject({ status: 404 });
  });
  it("gives pets without a photo an AI picture of their breed, drawn once and shared", async () => {
    const db = getDb();
    await db.delete(s.breedAvatars).where(and(eq(s.breedAvatars.species, "dog"), inArray(s.breedAvatars.breed, ["Beagle", "Pug"])));
    let calls = 0;
    const generate: BreedAvatarGenerator = async () => {
      calls++;
      return { mimeType: "image/png", base64: "iVBORw0KGgo=", model: "test/fake" };
    };
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const dog = { ...felix, name: "Rex", species: "dog" };
    const { ctx } = await onboarded();

    // The form's preview: only picker breeds, and a failure is reported, not thrown.
    expect(await previewBreedAvatar(ctx, { species: "dog", breed: "Other" }, { generate })).toEqual({ url: null, failed: false });
    expect(await previewBreedAvatar(ctx, { species: "dog", breed: "Sprocket the robot" }, { generate })).toEqual({ url: null, failed: false });
    expect(await previewBreedAvatar(ctx, { species: "dog", breed: "Pug" }, { generate: noPicture })).toEqual({ url: null, failed: true });
    expect(calls).toBe(0);
    const beagle = await previewBreedAvatar(ctx, { species: "dog", breed: "Beagle" }, { generate });
    expect(beagle.url).toMatch(/^\/api\/breed-avatars\/[0-9a-f-]{36}\?v=/);
    expect((await previewBreedAvatar(ctx, { species: "dog", breed: "Beagle" }, { generate })).url).toBe(beagle.url);
    expect(calls).toBe(1); // shared, not redrawn
    const id = beagle.url!.split("/")[3]!.split("?")[0]!;
    expect((await getBreedAvatarImage(id)).mimeType).toBe("image/png");

    // Saving uses the picture; a breed without one yet shows the initial until it's drawn after saving.
    const rex = await createPet(ctx, { ...dog, breed: "Beagle" });
    expect(rex.photoUrl).toBe(beagle.url);
    expect((await updateMyPet(ctx, rex.id, { ...dog, breed: "Pug" })).photoUrl).toBeNull();
    await ensurePetBreedAvatar(rex.id, { generate });
    const pug = (await getMyPet(ctx, rex.id)).photoUrl;
    expect(pug).toMatch(/^\/api\/breed-avatars\//);
    expect(pug).not.toBe(beagle.url);
    expect(calls).toBe(2);

    // A photo the customer chose stays through breed changes; removing it brings the breed picture back.
    const { photoUrl: custom } = await setMyPetPhoto(ctx, rex.id, png);
    expect((await updateMyPet(ctx, rex.id, { ...dog, breed: "Beagle" })).photoUrl).toBe(custom);
    await ensurePetBreedAvatar(rex.id, { generate }); // never replaces a chosen photo
    expect((await getMyPet(ctx, rex.id)).photoUrl).toBe(custom);
    expect(await removeMyPetPhoto(ctx, rex.id, { generate })).toEqual({ photoUrl: beagle.url });

    // Free-text breeds ("Other") never get a picture.
    expect((await updateMyPet(ctx, rex.id, { ...dog, breed: "Shelter mix" })).photoUrl).toBeNull();
    expect(calls).toBe(2);
  });

  it("lets staff see breed pictures and redraw one, switching every pet that shows it", async () => {
    const db = getDb();
    await db.delete(s.breedAvatars).where(and(eq(s.breedAvatars.species, "dog"), eq(s.breedAvatars.breed, "Whippet")));
    const staff = (permissions: string[], role: StaffContext["role"] = "customer_support"): StaffContext => ({
      kind: "staff",
      staffId: "00000000-0000-0000-0000-000000000000",
      email: "test@petwealth.com",
      name: "Test",
      role,
      permissions: new Set(permissions) as StaffContext["permissions"],
      via: "admin_ui",
    });
    const admin = staff([...ALL_PERMISSIONS], "super_admin");
    const viewer = staff(["pets.view"]);
    let n = 0;
    const generate: BreedAvatarGenerator = async () => ({ mimeType: "image/jpeg", base64: Buffer.from(`pic-${++n}`).toString("base64"), model: "test/fake" });
    const dog = { ...felix, species: "dog", breed: "Whippet" };

    const { ctx } = await onboarded();
    const before = (await previewBreedAvatar(ctx, { species: "dog", breed: "Whippet" }, { generate })).url!;
    const a = await createPet(ctx, { ...dog, name: "Ace" });
    const b = await createPet(ctx, { ...dog, name: "Bee" });
    await setMyPetPhoto(ctx, b.id, "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");

    const listed = (await listBreedAvatars(viewer, { species: "dog", q: "whip" })).find((x) => x.breed === "Whippet")!;
    expect(listed).toMatchObject({ url: before, petCount: 1, redrawn: false });
    await expect(redrawBreedAvatar(viewer, listed.id, { generate })).rejects.toMatchObject({ status: 403 });

    await new Promise((r) => setTimeout(r, 1100)); // so the new version differs from the old one
    const { url, pets } = await redrawBreedAvatar(admin, listed.id, { generate });
    expect(pets).toBe(1);
    expect(url).not.toBe(before);
    expect((await getMyPet(ctx, a.id)).photoUrl).toBe(url); // switched to the new picture
    expect((await getMyPet(ctx, b.id)).photoUrl).toMatch(/^\/api\/pets\//); // own photo untouched
    expect((await getBreedAvatarImage(listed.id)).content.toString()).toBe("pic-2");
    expect((await listBreedAvatars(viewer, { q: "Whippet" })).find((x) => x.id === listed.id)).toMatchObject({ redrawn: true, petCount: 1 });
    const [event] = await db.select().from(s.events).where(and(eq(s.events.entityId, listed.id), eq(s.events.type, "breed_avatar.redrawn")));
    expect(event?.payload).toMatchObject({ breed: "Whippet", pets: 1 });
  });

  it("deletes an account: personal details and pets go, kits, results, orders and addresses stay", async () => {
    const { ctx, pet } = await onboarded();
    const db = getDb();
    await setMyPetPhoto(ctx, pet.id, "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");
    const before = await getProfile(ctx);
    const [order] = await db.insert(s.orders).values({ customerId: ctx.customerId, source: "manual", subtotalCents: 9900, totalCents: 9900, placedAt: new Date(), shippingAddressId: before.addresses[0]!.id }).returning();
    const [kit] = await db
      .insert(s.kits)
      .values({ code: (await freshKitCode("cat", "fecal")), orderId: order!.id, customerId: ctx.customerId, petId: pet.id, species: "cat", panel: "fecal", status: "completed" })
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
