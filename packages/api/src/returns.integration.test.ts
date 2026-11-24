/**
 * Kit registration + return shipping against a real database.
 *   RUN_DB_TESTS=1 pnpm --filter @petwealth/api test
 * Creates its own customers/pets with random kit codes, so it can re-run without reseeding.
 */
import { randomInt } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, formatKitCode } from "@petwealth/domain";
import { and, eq, getDb, inArray, schema as s } from "@petwealth/db";
import { CarrierError, TestCarrier, type Carrier } from "@petwealth/integrations/carrier";
import type { StaffContext } from "./context";
import { EmailError, TestEmailSender, type EmailSender } from "@petwealth/integrations/email";
import { deliverQueuedEmails } from "./services/notifications";
import { receiveKit, transitionKit } from "./services/kits";
import { refreshTracking, registerKitsAsStaff, retryReturnLabel } from "./services/returns";

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

const code = (species: "dog" | "cat", panel: "fecal" | "respiratory" | "oral") => formatKitCode(species, panel, 900 + randomInt(99), randomInt(1000));

async function makeCustomer({ withAddress = true } = {}) {
  const db = getDb();
  const n = randomInt(1e9);
  const [c] = await db.insert(s.customers).values({ email: `returns.${n}@example.com`, firstName: "Ret", lastName: `Test${n}`, phone: "+14155550199" }).returning();
  if (withAddress) {
    await db.insert(s.addresses).values({ customerId: c!.id, line1: "1 Test St", city: "Austin", region: "TX", postalCode: "78701", isDefault: true });
  }
  const [cat, dog] = await db
    .insert(s.pets)
    .values([
      { customerId: c!.id, name: "Felix", species: "cat" },
      { customerId: c!.id, name: "Rex", species: "dog" },
    ])
    .returning();
  // One ordered (uncoded) cat fecal kit, as Shopify intake would create.
  const [orderedKit] = await db.insert(s.kits).values({ customerId: c!.id, species: "cat", panel: "fecal", status: "ordered" }).returning();
  return { customer: c!, cat: cat!, dog: dog!, orderedKit: orderedKit! };
}

const failing: Carrier = {
  name: "fedex",
  createReturnShipment: async () => {
    throw new CarrierError("FedEx /ship/v1/shipments failed — SHIPPER.POSTALSTATE.MISMATCH", false);
  },
  track: async () => [],
};

describe.skipIf(!run)("kit registration & returns (db)", () => {
  afterAll(async () => {
    await getDb().$client.end();
  });

  it("registers kits together into one mailer with an RMA and QR code", async () => {
    const { customer, cat, dog, orderedKit } = await makeCustomer();
    const catCode = code("cat", "fecal");
    const dogCode = code("dog", "respiratory");
    const mail = new TestEmailSender();
    const res = await registerKitsAsStaff(
      staff,
      customer.id,
      { kits: [{ kitCode: catCode.toLowerCase(), petId: cat.id }, { kitCode: dogCode, petId: dog.id }] },
      { carrier: new TestCarrier(), email: mail },
    );

    expect(res.label).toEqual({ status: "label_created" });
    expect(res.rmaNumber).toMatch(/^PWR\d{7}$/);
    expect(res.kits).toEqual([{ code: catCode, petName: "Felix" }, { code: dogCode, petName: "Rex" }]);

    const db = getDb();
    const matched = await db.query.kits.findFirst({ where: eq(s.kits.id, orderedKit.id) });
    expect(matched).toMatchObject({ code: catCode, petId: cat.id, status: "assigned" }); // linked to the Shopify-ordered kit
    const standalone = await db.query.kits.findFirst({ where: eq(s.kits.code, dogCode) });
    expect(standalone).toMatchObject({ customerId: customer.id, petId: dog.id, status: "assigned", orderId: null });

    const shipment = await db.query.shipments.findFirst({ where: eq(s.shipments.id, res.shipmentId), with: { kits: true, label: true } });
    expect(shipment).toMatchObject({ direction: "return", status: "label_created", carrier: "test", labelFormat: "qr_png", rmaNumber: res.rmaNumber });
    expect(shipment!.kits).toHaveLength(2);
    expect(shipment!.label?.mimeType).toBe("image/png");

    const email = await db.select().from(s.notifications).where(and(eq(s.notifications.customerId, customer.id), eq(s.notifications.template, "return_label_ready")));
    expect(email).toHaveLength(1);
    expect(email[0]).toMatchObject({ status: "sent", providerMessageId: expect.stringMatching(/^test_/), error: null });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: customer.email, subject: "Your FedEx code is ready", idempotencyKey: `notification-${email[0]!.id}` });
    expect(mail.sent[0]!.text).toContain("Felix's Fecal test and Rex's Respiratory test");
    expect(mail.sent[0]!.attachments?.map((a) => a.contentId)).toEqual(["petwealth-logo", "fedex-code"]);
  });

  it("keeps the email queued through a Resend outage and fails it on a bad request", async () => {
    const { customer, cat } = await makeCustomer();
    const outage: EmailSender = { name: "test", send: async () => Promise.reject(new EmailError("Resend rejected the email: busy", true)) };
    const res = await registerKitsAsStaff(staff, customer.id, { kits: [{ kitCode: code("cat", "oral"), petId: cat.id }] }, { carrier: new TestCarrier(), email: outage });
    expect(res.label).toEqual({ status: "label_created" }); // email trouble never undoes the label
    const [row] = await getDb().select().from(s.notifications).where(eq(s.notifications.customerId, customer.id));
    expect(row).toMatchObject({ status: "queued", error: "Resend rejected the email: busy" });

    const rejected: EmailSender = { name: "test", send: async () => Promise.reject(new EmailError("Resend rejected the email: domain not verified", false)) };
    expect(await deliverQueuedEmails({ ids: [row!.id], sender: rejected })).toMatchObject({ failed: 1 });
    expect((await getDb().query.notifications.findFirst({ where: eq(s.notifications.id, row!.id) }))?.status).toBe("failed");
  });

  it("rejects the wrong species, duplicate registration and other customers' kits", async () => {
    const a = await makeCustomer();
    const b = await makeCustomer();
    await expect(registerKitsAsStaff(staff, a.customer.id, { kits: [{ kitCode: code("cat", "oral"), petId: a.dog.id }] })).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("is a cat kit, but Rex is a dog"),
    });

    const taken = code("dog", "fecal");
    await registerKitsAsStaff(staff, a.customer.id, { kits: [{ kitCode: taken, petId: a.dog.id }] }, { carrier: new TestCarrier() });
    await expect(registerKitsAsStaff(staff, a.customer.id, { kits: [{ kitCode: taken, petId: a.dog.id }] })).rejects.toMatchObject({ status: 409 });
    await expect(registerKitsAsStaff(staff, b.customer.id, { kits: [{ kitCode: taken, petId: b.dog.id }] })).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("another account"),
    });
    await expect(registerKitsAsStaff(staff, a.customer.id, { kits: [{ kitCode: code("dog", "oral"), petId: b.dog.id }] })).rejects.toMatchObject({ status: 422 });
  });

  it("requires a shipping address", async () => {
    const { customer, cat } = await makeCustomer({ withAddress: false });
    await expect(registerKitsAsStaff(staff, customer.id, { kits: [{ kitCode: code("cat", "fecal"), petId: cat.id }] })).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("shipping address"),
    });
  });

  it("keeps the registration when FedEx fails, and retries cleanly", async () => {
    const { customer, cat } = await makeCustomer();
    const kitCode = code("cat", "respiratory");
    const res = await registerKitsAsStaff(staff, customer.id, { kits: [{ kitCode, petId: cat.id }] }, { carrier: failing });
    expect(res.label).toMatchObject({ status: "failed", error: expect.stringContaining("POSTALSTATE") });
    const kit = await getDb().query.kits.findFirst({ where: eq(s.kits.code, kitCode) });
    expect(kit?.status).toBe("assigned");
    expect((await getDb().query.shipments.findFirst({ where: eq(s.shipments.id, res.shipmentId) }))?.status).toBe("failed");

    expect(await retryReturnLabel(staff, res.shipmentId, { carrier: new TestCarrier() })).toEqual({ status: "label_created" });
    await expect(retryReturnLabel(staff, res.shipmentId, { carrier: new TestCarrier() })).rejects.toMatchObject({ status: 409 });
  });

  it("moves kits to In Transit when the mailer is picked up, and handles delivery", async () => {
    const { customer, cat, dog } = await makeCustomer();
    let now = Date.now();
    const carrier = new TestCarrier(() => now);
    const res = await registerKitsAsStaff(
      staff,
      customer.id,
      { kits: [{ kitCode: code("cat", "oral"), petId: cat.id }, { kitCode: code("dog", "oral"), petId: dog.id }] },
      { carrier },
    );
    const db = getDb();
    const kitIds = (await db.select().from(s.shipmentKits).where(eq(s.shipmentKits.shipmentId, res.shipmentId))).map((r) => r.kitId);

    now += 11 * 60_000; // picked up
    const r1 = await refreshTracking({ carrier, now: new Date(now) });
    expect(r1.errors).toEqual([]);
    const sh1 = await db.query.shipments.findFirst({ where: eq(s.shipments.id, res.shipmentId) });
    expect(sh1).toMatchObject({ status: "in_transit" });
    expect(sh1!.pickedUpAt).not.toBeNull();
    const kits1 = await db.select().from(s.kits).where(inArray(s.kits.id, kitIds));
    expect(kits1.map((k) => k.status)).toEqual(["in_transit", "in_transit"]);

    now += 1 * 60_000; // too soon to poll again
    await refreshTracking({ carrier, now: new Date(now) });
    expect((await db.query.shipments.findFirst({ where: eq(s.shipments.id, res.shipmentId) }))?.status).toBe("in_transit");

    now += 30 * 60_000; // delivered to the lab
    await refreshTracking({ carrier, now: new Date(now) });
    const sh2 = await db.query.shipments.findFirst({ where: eq(s.shipments.id, res.shipmentId) });
    expect(sh2).toMatchObject({ status: "delivered" });
    const kits2 = await db.select().from(s.kits).where(inArray(s.kits.id, kitIds));
    expect(kits2.every((k) => k.status === "in_transit")).toBe(true); // lab scan does "received"
  });
  it("emails once per mailer as kits travel, reach the lab and get results", async () => {
    const { customer, cat, dog } = await makeCustomer();
    let now = Date.now();
    const carrier = new TestCarrier(() => now);
    const catCode = code("cat", "oral");
    const dogCode = code("dog", "oral");
    const res = await registerKitsAsStaff(staff, customer.id, { kits: [{ kitCode: catCode, petId: cat.id }, { kitCode: dogCode, petId: dog.id }] }, { carrier, email: new TestEmailSender() });
    const db = getDb();
    const queued = async (template: string) =>
      db.select().from(s.notifications).where(and(eq(s.notifications.customerId, customer.id), eq(s.notifications.template, template)));
    const later = () => Date.now() + 3 * 60_000; // past the settle window

    now += 11 * 60_000; // picked up: both kits go In Transit together
    await refreshTracking({ carrier, now: new Date(now) });
    const transit = await queued("kit_in_transit");
    expect(transit.map((n) => [n.channel, n.status])).toEqual([["email", "queued"], ["email", "queued"]]);

    const mail = new TestEmailSender();
    const ids = transit.map((n) => n.id);
    expect(await deliverQueuedEmails({ ids, sender: mail })).toMatchObject({ waiting: 2, sent: 0 }); // still settling
    expect(await deliverQueuedEmails({ ids, sender: mail, now: later })).toMatchObject({ sent: 2 });
    expect(mail.sent).toHaveLength(1); // one email for the mailer
    const shipment = await db.query.shipments.findFirst({ where: eq(s.shipments.id, res.shipmentId) });
    expect(mail.sent[0]).toMatchObject({ to: customer.email, subject: "Your samples are on the way to our lab", idempotencyKey: expect.stringMatching(/^notifications-/) });
    expect(mail.sent[0]!.text).toMatch(/the mailer with (Felix's Oral test and Rex's Oral test|Rex's Oral test and Felix's Oral test)\./);
    expect(mail.sent[0]!.text).toContain(`FedEx tracking number: ${shipment!.trackingNumber}`);
    const sentRows = await queued("kit_in_transit");
    expect(new Set(sentRows.map((n) => `${n.status}:${n.providerMessageId}`)).size).toBe(1);

    await receiveKit(staff, { kitCode: catCode });
    const received = await queued("kit_received");
    expect(await deliverQueuedEmails({ ids: received.map((n) => n.id), sender: mail, now: later })).toMatchObject({ sent: 1 });
    expect(mail.sent[1]).toMatchObject({ subject: "Felix's sample is at our lab" });
    expect(mail.sent[1]!.text).toContain("We'll email you when Felix's results are ready.");

    await transitionKit(staff, { kitCode: catCode, to: "processing" });
    await transitionKit(staff, { kitCode: catCode, to: "completed" });
    const ready = await queued("results_ready");
    expect(await deliverQueuedEmails({ ids: ready.map((n) => n.id), sender: mail, now: later })).toMatchObject({ sent: 1 });
    expect(mail.sent[2]).toMatchObject({ subject: "Felix's results are ready" });
    expect(mail.sent[2]!.html).toContain(`/kits/${catCode}`);

    // Results pulled back for a rerun before the email went out: no email.
    await transitionKit(staff, { kitCode: catCode, to: "rerun" });
    await transitionKit(staff, { kitCode: catCode, to: "processing" });
    await transitionKit(staff, { kitCode: catCode, to: "completed" });
    await transitionKit(staff, { kitCode: catCode, to: "rerun" });
    const again = (await queued("results_ready")).filter((n) => n.status === "queued");
    expect(await deliverQueuedEmails({ ids: again.map((n) => n.id), sender: mail, now: later })).toMatchObject({ skipped: 1, sent: 0 });
    expect(mail.sent).toHaveLength(3);
  });
});
