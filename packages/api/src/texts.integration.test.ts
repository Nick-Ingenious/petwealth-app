/** Customer texts against a real database (RUN_DB_TESTS=1). Nothing is sent: TestSmsSender records. */
import { randomInt } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { ALL_PERMISSIONS } from "@petwealth/domain";
import { and, eq, getDb, schema as s } from "@petwealth/db";
import { TestCarrier } from "@petwealth/integrations/carrier";
import { TestEmailSender } from "@petwealth/integrations/email";
import { SmsError, TestSmsSender, type SmsSender } from "@petwealth/integrations/sms";
import type { StaffContext } from "./context";
import { freshKitCode } from "./test-kit-codes";
import { receiveKit } from "./services/kits";
import { MAIL_SAMPLE_REMINDER, queueMailSampleReminders } from "./services/notifications";
import { registerKitsAsStaff } from "./services/returns";
import { deliverQueuedTexts, handleTwilioWebhook } from "./services/texts";

const run = process.env.RUN_DB_TESTS === "1";
const staff: StaffContext = {
  kind: "staff",
  staffId: "00000000-0000-0000-0000-000000000000",
  email: "test@petwealth.com",
  name: "Test",
  role: "super_admin",
  permissions: new Set(ALL_PERMISSIONS),
  via: "admin_ui",
};
/** 11am in Texas. */
const DAYTIME = new Date("2026-11-25T17:00:00Z").getTime();
const MIN = 60 * 1000;

async function customer({ smsOptIn = true, region = "TX" } = {}) {
  const db = getDb();
  const national = `512${randomInt(2_000_000, 9_999_999)}`;
  const [c] = await db
    .insert(s.customers)
    .values({ email: `texts.${randomInt(1e9)}@example.com`, firstName: "Tex", lastName: "Ter", phone: `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`, smsOptIn })
    .returning();
  await db.insert(s.addresses).values({ customerId: c!.id, line1: "1 Test St", city: "Austin", region, postalCode: "78701", isDefault: true });
  const [pet] = await db.insert(s.pets).values({ customerId: c!.id, name: "Felix", species: "cat" }).returning();
  return { customer: c!, pet: pet!, e164: `+1${national}` };
}

async function kitAtLabDoor(customerId: string, petId: string) {
  const code = await freshKitCode("cat", "fecal");
  await getDb().insert(s.kits).values({ code, customerId, petId, species: "cat", panel: "fecal", status: "in_transit" });
  return code;
}

const texts = (customerId: string) =>
  getDb().select().from(s.notifications).where(and(eq(s.notifications.customerId, customerId), eq(s.notifications.channel, "sms"))).orderBy(s.notifications.createdAt);
/** Pretend the text was queued at `at`, so quiet hours and staleness are deterministic. */
const queuedAt = (id: string, at: number) => getDb().update(s.notifications).set({ createdAt: new Date(at) }).where(eq(s.notifications.id, id));

describe.skipIf(!run)("customer texts (db)", () => {
  afterAll(async () => {
    await getDb().$client.end();
  });

  it("texts an opted-in customer when the lab receives the kit, and tracks delivery", async () => {
    const { customer: c, pet, e164 } = await customer();
    const code = await kitAtLabDoor(c.id, pet.id);
    await receiveKit(staff, { kitCode: code });
    const [row] = await texts(c.id);
    expect(row).toMatchObject({ template: "kit_received", status: "queued" });
    await queuedAt(row!.id, DAYTIME);

    const sms = new TestSmsSender();
    expect(await deliverQueuedTexts({ sender: sms, ids: [row!.id], now: () => DAYTIME + MIN })).toMatchObject({ waiting: 1 }); // settling
    expect(await deliverQueuedTexts({ sender: sms, ids: [row!.id], now: () => DAYTIME + 3 * MIN })).toMatchObject({ sent: 1 });
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]!.to).toBe(e164);
    expect(sms.sent[0]!.body).toMatch(new RegExp(`^Petwealth: Felix's sample reached our lab\\. .*/kits/${code} Reply STOP to opt out\\.$`));

    const [sent] = await texts(c.id);
    expect(sent!.providerMessageId).toMatch(/^test_/);
    await handleTwilioWebhook({ MessageSid: sent!.providerMessageId!, MessageStatus: "delivered" });
    expect((await texts(c.id))[0]!.status).toBe("delivered");
  });

  it("never queues texts for customers who didn't opt in", async () => {
    const { customer: c, pet } = await customer({ smsOptIn: false });
    await receiveKit(staff, { kitCode: await kitAtLabDoor(c.id, pet.id) });
    expect(await texts(c.id)).toHaveLength(0);
  });

  it("waits for daytime, drops stale texts, and retries only safe failures", async () => {
    const { customer: c, pet } = await customer();
    await receiveKit(staff, { kitCode: await kitAtLabDoor(c.id, pet.id) });
    const [row] = await texts(c.id);
    const night = new Date("2026-11-25T06:00:00Z").getTime(); // midnight in Texas
    await queuedAt(row!.id, night);
    const sms = new TestSmsSender();
    expect(await deliverQueuedTexts({ sender: sms, ids: [row!.id], now: () => night + 10 * MIN })).toMatchObject({ waiting: 1 });

    const flaky: SmsSender = { name: "test", send: async () => Promise.reject(new SmsError("Twilio outage", true)) };
    expect(await deliverQueuedTexts({ sender: flaky, ids: [row!.id], now: () => night + 9 * 60 * MIN })).toMatchObject({ retrying: 1 }); // 9am, Twilio down
    expect((await texts(c.id))[0]).toMatchObject({ status: "queued", providerMessageId: null, error: "Twilio outage" });

    expect(await deliverQueuedTexts({ sender: sms, ids: [row!.id], now: () => night + 25 * 60 * MIN })).toMatchObject({ skipped: 1 });
    expect((await texts(c.id))[0]).toMatchObject({ status: "skipped", error: "Too old to text" });
    expect(sms.sent).toHaveLength(0);
  });

  it("honours STOP and START replies, whatever format the number was typed in", async () => {
    const db = getDb();
    const { customer: c, pet, e164 } = await customer();
    await receiveKit(staff, { kitCode: await kitAtLabDoor(c.id, pet.id) });
    expect(await texts(c.id)).toHaveLength(1);

    expect(await handleTwilioWebhook({ From: e164, Body: "Stop", MessageSid: "SMin1" })).toMatchObject({ outcome: "opted_out", customers: 1 });
    expect((await db.query.customers.findFirst({ where: eq(s.customers.id, c.id) }))?.smsOptIn).toBe(false);
    expect((await texts(c.id))[0]).toMatchObject({ status: "skipped", error: "Customer replied STOP" });
    const [event] = await db.select().from(s.events).where(and(eq(s.events.entityId, c.id), eq(s.events.type, "customer.sms_opted_out")));
    expect(event).toMatchObject({ actorType: "integration", actorId: "twilio" });

    expect(await handleTwilioWebhook({ From: e164, Body: "hello there", MessageSid: "SMin2" })).toMatchObject({ outcome: "ignored" });
    expect(await handleTwilioWebhook({ From: e164, Body: "START", MessageSid: "SMin3" })).toMatchObject({ outcome: "opted_in" });
    expect((await db.query.customers.findFirst({ where: eq(s.customers.id, c.id) }))?.smsOptIn).toBe(true);
  });

  it("texts the mail-your-sample reminder alongside the email, as one reminder round", async () => {
    const db = getDb();
    const { customer: c, pet } = await customer();
    const res = await registerKitsAsStaff(
      staff,
      c.id,
      { kits: [{ kitCode: await freshKitCode("cat", "oral"), petId: pet.id }] },
      { carrier: new TestCarrier(), email: new TestEmailSender() },
    );
    const start = DAYTIME - 4 * 24 * 60 * MIN;
    await db.update(s.shipments).set({ createdAt: new Date(start) }).where(eq(s.shipments.id, res.shipmentId));

    await queueMailSampleReminders({ now: () => DAYTIME });
    await queueMailSampleReminders({ now: () => DAYTIME + MIN });
    const reminders = await db.select().from(s.notifications).where(and(eq(s.notifications.customerId, c.id), eq(s.notifications.template, MAIL_SAMPLE_REMINDER)));
    expect(reminders.map((r) => r.channel).sort()).toEqual(["email", "sms"]);

    const sms = new TestSmsSender();
    const text = reminders.find((r) => r.channel === "sms")!;
    expect(await deliverQueuedTexts({ sender: sms, ids: [text.id], now: () => DAYTIME + MIN })).toMatchObject({ sent: 1 });
    expect(sms.sent[0]!.body).toMatch(/^Petwealth: Ready to mail Felix's sample\? Your FedEx code is in the app: /);
  });
});
