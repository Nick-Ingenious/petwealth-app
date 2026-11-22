/** Customer portal services against a real database (RUN_DB_TESTS=1). */
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { formatKitCode } from "@petwealth/domain";
import { eq, getDb, schema as s } from "@petwealth/db";
import { TestCarrier } from "@petwealth/integrations/carrier";
import {
  checkKitCode,
  completeOnboarding,
  createPet,
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
});
