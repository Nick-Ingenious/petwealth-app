/**
 * End-to-end test of the legacy import against a made-up old database
 * (fixtures/legacy-sample.sql). Needs a local Postgres it can create databases on:
 *
 *   LEGACY_IT_ADMIN_URL=postgres://petwealth:petwealth@localhost:54329/postgres pnpm --filter @petwealth/db test
 *
 * Skipped when LEGACY_IT_ADMIN_URL isn't set (e.g. CI without a database).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, isNotNull } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../client";
import * as s from "../schema";
import { readLegacy, runImport, type LegacyData } from "./import";

const ADMIN_URL = process.env.LEGACY_IT_ADMIN_URL;
const SRC = "petwealth_legacy_it_src";
const DST = "petwealth_legacy_it_dst";
const urlFor = (db: string) => {
  const u = new URL(ADMIN_URL!);
  u.pathname = `/${db}`;
  return u.toString();
};

describe.skipIf(!ADMIN_URL)("legacy import (end to end)", () => {
  let data: LegacyData;

  beforeAll(async () => {
    const admin = postgres(ADMIN_URL!, { max: 1, onnotice: () => {} });
    for (const db of [SRC, DST]) {
      await admin.unsafe(`drop database if exists ${db} with (force)`);
      await admin.unsafe(`create database ${db}`);
    }
    await admin.end();

    const src = postgres(urlFor(SRC), { max: 1, onnotice: () => {} });
    await src.unsafe(readFileSync(fileURLToPath(new URL("./fixtures/legacy-sample.sql", import.meta.url)), "utf8"));
    await src.end();

    process.env.DATABASE_URL = urlFor(DST);
    await migrate(getDb(), { migrationsFolder: fileURLToPath(new URL("../../migrations", import.meta.url)) });
    data = await readLegacy(urlFor(SRC), () => {});
  }, 60_000);

  afterAll(async () => {
    if (ADMIN_URL) await getDb().$client.end();
  });

  it("never reads secrets from the old database", () => {
    expect(data.users.every((u) => !("password_hash" in u))).toBe(true);
    expect(data.fedex_return_shipments.every((r) => !("processing_token" in r))).toBe(true);
  });

  it("saves nothing on a dry run", async () => {
    const { report } = await runImport(data, { apply: false });
    expect(report.get("customers", "created")).toBe(2);
    expect(await getDb().select().from(s.customers)).toHaveLength(0);
  });

  it("imports the old data", async () => {
    const { report, files } = await runImport(data, { apply: true });
    const db = getDb();

    // Customers: Alex's two accounts merged, the vet, and the guest from a Shopify order. Staff and placeholders left out.
    const customers = await db.select().from(s.customers);
    expect(customers.map((c) => c.email).sort()).toEqual(["alex@example.com", "guest@shopper.example", "vet@clinic.example"]);
    const alex = customers.find((c) => c.email === "alex@example.com")!;
    expect(alex).toMatchObject({ firstName: "Alexandra", lastName: "Rivers", phone: "5125550100", smsOptIn: true, customerType: "pet_parent", legacyId: "1" });
    expect(customers.find((c) => c.email === "vet@clinic.example")!.customerType).toBe("pet_professional");
    expect(report.get("customers", "skipped: staff (added by hand)")).toBe(1);

    // Pets: dog with the new fields, cat with a birth date from its age; bird and deleted pet left out.
    const pets = await db.select().from(s.pets);
    expect(pets.map((p) => p.name).sort()).toEqual(["Biscuit", "Mochi"]);
    expect(pets.find((p) => p.name === "Biscuit")).toMatchObject({
      breed: "Labrador Retriever",
      microchip: "985112003",
      vetNotes: "Allergic to chicken",
      notes: "Loves fetch",
      spayedNeutered: true,
      customerId: alex.id,
    });
    expect(pets.find((p) => p.name === "Mochi")!.dateOfBirth).toBe("2023-06-01");

    // Orders: money in cents, old number kept; the order with no owner left out.
    const orders = await db.select().from(s.orders);
    expect(orders).toHaveLength(3);
    const delivered = orders.find((o) => o.legacyOrderNumber === "ORDER-GCS-000100-001")!;
    expect(delivered).toMatchObject({ status: "fulfilled", source: "shopify", totalCents: 20642, taxCents: 1842, discountCents: 1000, subtotalCents: 19800 });
    expect(orders.find((o) => o.legacyOrderNumber === "ORDER-GCS-000102-003")!.status).toBe("cancelled");

    // Kits: real ones by code, three placeholders for the guest's complete kit; SKIN and ownerless kits left out.
    const kits = await db.select().from(s.kits);
    const byCode = new Map(kits.filter((k) => k.code).map((k) => [k.code!, k]));
    expect([...byCode.keys()].sort()).toEqual(["CFEC-001-001", "FORA-001-002", "RES-000-050"]);
    expect(byCode.get("CFEC-001-001")).toMatchObject({ status: "completed", species: "dog", panel: "fecal" });
    expect(byCode.get("FORA-001-002")).toMatchObject({ status: "delivered", species: "cat", panel: "oral" });
    expect(byCode.get("RES-000-050")).toMatchObject({ status: "rerun", species: "cat", panel: "respiratory" });
    expect(kits.filter((k) => !k.code).map((k) => k.panel).sort()).toEqual(["fecal", "oral", "respiratory"]);
    expect(report.get("kits", "skipped: no owner (decision 2)")).toBe(1);
    expect(report.get("kits", "skipped: not a dog or cat fecal, oral or respiratory kit (decision 3)")).toBe(1);

    // Shipments: outbound, the FedEx return with its RMA, an older return tracked on the kit.
    const shipments = await db.select().from(s.shipments);
    expect(shipments.map((x) => `${x.direction}:${x.trackingNumber}:${x.status}`).sort()).toEqual([
      "outbound:7712345:delivered",
      "return:7700001:in_transit",
      "return:7799001:delivered",
    ]);
    expect(shipments.find((x) => x.rmaNumber === "PWR0100007")).toBeTruthy();

    // Result, approved AI summary, open rerun, history.
    const [result] = await db.select().from(s.labResults);
    expect(result).toMatchObject({ status: "released", healthStatus: "needs_attention", kitId: byCode.get("CFEC-001-001")!.id });
    expect(result!.targets.map((x) => `${x.name}:${x.call}`)).toEqual(["Giardia spp.:detected", "Salmonella spp.:not_detected"]);
    expect(result!.raw).not.toHaveProperty("customer_email");
    const [summary] = await db.select().from(s.aiReports);
    expect(summary).toMatchObject({
      model: "legacy",
      content: { vetUrgency: "soon", nextSteps: ["Share these results with your vet", "Pick up after Biscuit promptly"] },
    });
    expect(summary!.reviewedAt).not.toBeNull();
    expect(await db.select().from(s.rerunQueue)).toHaveLength(1);
    expect(await db.select().from(s.events).where(eq(s.events.type, "kit.status_changed"))).toHaveLength(3);
    expect(await db.select().from(s.events).where(eq(s.events.type, "order.note"))).toHaveLength(1);

    // Files to copy: the custom pet photo (not the AI one), the return QR, the report PDF.
    expect(files.map((f) => `${f.kind}:${f.source}`).sort()).toEqual([
      "pet_photo:pets/biscuit.jpg",
      "report_pdf:reports/CFEC-001-001.pdf",
      "return_label:returns/PWR0100007.png",
    ]);
  });

  it("can run again without duplicating anything", async () => {
    const db = getDb();
    const count = async () => ({
      customers: (await db.select().from(s.customers)).length,
      kits: (await db.select().from(s.kits)).length,
      events: (await db.select().from(s.events)).length,
      shipments: (await db.select().from(s.shipments)).length,
      addresses: (await db.select().from(s.addresses)).length,
    });
    const before = await count();
    const { report } = await runImport(data, { apply: true });
    expect(await count()).toEqual(before);
    for (const [entity, m] of report.counts) {
      if (entity !== "reconciliation") expect([entity, m.get("created") ?? 0]).toEqual([entity, 0]);
    }
  });

  it("never overwrites what the new app created itself", async () => {
    const db = getDb();
    await db.update(s.kits).set({ legacyId: null, status: "processing" }).where(eq(s.kits.code, "FORA-001-002"));
    const { report } = await runImport(data, { apply: true });
    expect(report.get("kits", "already in new app (reused)")).toBe(1);
    const [kit] = await db.select().from(s.kits).where(eq(s.kits.code, "FORA-001-002"));
    expect(kit!.status).toBe("processing");
    expect((await db.select().from(s.kits).where(isNotNull(s.kits.code))).length).toBe(3);
  });
});
