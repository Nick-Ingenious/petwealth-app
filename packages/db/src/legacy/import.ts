/**
 * Import data from the old AWS app into this database (docs/LEGACY_MAPPING.md).
 *
 *   LEGACY_DATABASE_URL=postgres://...  DATABASE_URL=postgres://...  pnpm --filter @petwealth/db legacy:import [--apply] [--manifest <file>]
 *
 * - Reads the old database only (read-only session); never writes to it.
 * - Dry run by default: everything runs in one transaction that is rolled back,
 *   and the report shows what would happen. `--apply` commits.
 * - Safe to run again: rows are matched on legacy_id, so a rerun updates what it
 *   created before. Rows the new app created itself (same email, Shopify order,
 *   kit code, tracking number) are reused, never overwritten.
 * - Files in S3 (pet photos, return QR labels, report PDFs) are listed in a
 *   manifest for the file-copy step.
 */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { panelsForTestType, type KitStatus, type Panel, type Species, type TestType } from "@petwealth/domain";
import { eq, inArray, isNotNull, sql } from "drizzle-orm";
import postgres from "postgres";
import { getDb, type Tx } from "../client";
import * as s from "../schema";
import * as t from "./transform";

type Row = t.Row;

// ── Report ─────────────────────────────────────────────────────────────

export class Report {
  readonly counts = new Map<string, Map<string, number>>();
  readonly examples = new Map<string, string[]>();

  add(entity: string, outcome: string, n = 1) {
    const m = this.counts.get(entity) ?? new Map<string, number>();
    m.set(outcome, (m.get(outcome) ?? 0) + n);
    this.counts.set(entity, m);
  }

  get(entity: string, outcome: string): number {
    return this.counts.get(entity)?.get(outcome) ?? 0;
  }

  /** Count a skipped row and keep a few examples of why. */
  skip(entity: string, reason: string, example?: string) {
    this.add(entity, `skipped: ${reason}`);
    if (example) {
      const key = `${entity}: ${reason}`;
      const list = this.examples.get(key) ?? [];
      if (list.length < 5) list.push(example);
      this.examples.set(key, list);
    }
  }

  print(title: string) {
    console.log(`\n${title}`);
    for (const [entity, m] of this.counts) {
      console.log(`  ${entity}`);
      for (const [outcome, n] of m) console.log(`    ${outcome.padEnd(64)} ${n}`);
    }
    if (this.examples.size) {
      console.log("\n  Examples of skipped rows (old ids):");
      for (const [key, list] of this.examples) console.log(`    ${key}: ${list.join(", ")}`);
    }
  }
}

// ── Reading the old database ───────────────────────────────────────────

export interface LegacyData {
  users: Row[];
  animal: Row[];
  breeds: Row[];
  orders: Row[];
  order_kits: Row[];
  order_comments: Row[];
  logistic_kits: Row[];
  tests: Row[];
  tests_status_history: Row[];
  pet_score: Row[];
  pdf_reports: Row[];
  fedex_return_shipments: Row[];
  lab_rerun_queue: Row[];
}

export const LEGACY_TABLES: (keyof LegacyData)[] = [
  "users",
  "animal",
  "breeds",
  "orders",
  "order_kits",
  "order_comments",
  "logistic_kits",
  "tests",
  "tests_status_history",
  "pet_score",
  "pdf_reports",
  "fedex_return_shipments",
  "lab_rerun_queue",
];

/** Secrets never leave the old database, even into memory. */
const DROP_COLUMNS: Partial<Record<keyof LegacyData, string[]>> = {
  users: ["password_hash"],
  fedex_return_shipments: ["processing_token", "email_claim_token"],
};

/**
 * Whole rows as JSON (to_jsonb), so a column the old schema lacks reads as
 * undefined instead of failing. Missing tables read as empty.
 */
export async function readLegacy(url: string, log: (m: string) => void = console.log): Promise<LegacyData> {
  const src = postgres(url, { max: 2, connect_timeout: 15, connection: { default_transaction_read_only: true }, onnotice: () => {} });
  try {
    const data = {} as LegacyData;
    for (const table of LEGACY_TABLES) {
      const [exists] = await src`select to_regclass(${`public.${table}`}) is not null as ok`;
      if (!exists?.ok) {
        log(`  old table ${table} not found, treated as empty`);
        data[table] = [];
        continue;
      }
      const drop = (DROP_COLUMNS[table] ?? []).map((c) => ` - '${c}'`).join("");
      const rows = await src.unsafe(`select (to_jsonb(t.*)${drop}) as r from public.${table} t`);
      data[table] = rows.map((x) => x.r as Row);
      log(`  read ${table.padEnd(24)} ${rows.length}`);
    }
    return data;
  } finally {
    await src.end();
  }
}

// ── Import ─────────────────────────────────────────────────────────────

export interface FileToCopy {
  kind: "pet_photo" | "return_label" | "report_pdf";
  targetId: string;
  legacyId: string;
  source: string;
}

class Rollback extends Error {}

export interface ImportResult {
  report: Report;
  files: FileToCopy[];
}

type LegacyTable =
  | typeof s.customers
  | typeof s.addresses
  | typeof s.pets
  | typeof s.orders
  | typeof s.orderItems
  | typeof s.kits
  | typeof s.shipments
  | typeof s.labResults
  | typeof s.aiReports
  | typeof s.rerunQueue;

/** Map of legacy_id → id for one table. */
async function legacyIds(tx: Tx, table: LegacyTable): Promise<Map<string, string>> {
  const rows = await tx.select({ id: table.id, legacyId: table.legacyId }).from(table).where(isNotNull(table.legacyId));
  return new Map(rows.map((r) => [r.legacyId!, r.id]));
}

export async function runImport(data: LegacyData, opts: { apply: boolean }): Promise<ImportResult> {
  const report = new Report();
  const files: FileToCopy[] = [];
  try {
    await getDb().transaction(async (tx) => {
      await importAll(tx, data, report, files);
      if (!opts.apply) throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return { report, files };
}

const upper = (v: unknown) => String(v ?? "").trim().toUpperCase();

async function importAll(tx: Tx, d: LegacyData, report: Report, files: FileToCopy[]) {
  const ids = {
    customers: await legacyIds(tx, s.customers),
    addresses: await legacyIds(tx, s.addresses),
    pets: await legacyIds(tx, s.pets),
    orders: await legacyIds(tx, s.orders),
    orderItems: await legacyIds(tx, s.orderItems),
    kits: await legacyIds(tx, s.kits),
    shipments: await legacyIds(tx, s.shipments),
    labResults: await legacyIds(tx, s.labResults),
    aiReports: await legacyIds(tx, s.aiReports),
    rerunQueue: await legacyIds(tx, s.rerunQueue),
  };

  // Customers this import created before, by email (their merged group's smallest id can change between runs).
  const importedByEmail = new Map(
    (await tx.select({ id: s.customers.id, email: s.customers.email, legacyId: s.customers.legacyId }).from(s.customers).where(isNotNull(s.customers.legacyId))).map(
      (c) => [c.email.toLowerCase(), c.id],
    ),
  );
  // Rows the new app created itself, by natural key: reused, never overwritten.
  const native = {
    customerByEmail: new Map(
      (await tx.select({ id: s.customers.id, email: s.customers.email, legacyId: s.customers.legacyId }).from(s.customers))
        .filter((c) => !c.legacyId)
        .map((c) => [c.email.toLowerCase(), c.id]),
    ),
    orderByShopifyId: new Map(
      (await tx.select({ id: s.orders.id, sid: s.orders.shopifyOrderId, legacyId: s.orders.legacyId }).from(s.orders).where(isNotNull(s.orders.shopifyOrderId)))
        .filter((o) => !o.legacyId)
        .map((o) => [o.sid!, o.id]),
    ),
    kitByCode: new Map(
      (await tx.select({ id: s.kits.id, code: s.kits.code, legacyId: s.kits.legacyId }).from(s.kits).where(isNotNull(s.kits.code)))
        .filter((k) => !k.legacyId)
        .map((k) => [k.code!, k.id]),
    ),
    shipmentByKey: new Map<string, string>(
      (
        await tx
          .select({ id: s.shipments.id, carrier: s.shipments.carrier, tn: s.shipments.trackingNumber, rma: s.shipments.rmaNumber, legacyId: s.shipments.legacyId })
          .from(s.shipments)
      )
        .filter((x) => !x.legacyId)
        .flatMap((x) => [...(x.tn ? [[`${x.carrier}|${x.tn}`, x.id] as const] : []), ...(x.rma ? [[`rma|${x.rma}`, x.id] as const] : [])]),
    ),
  };
  const legacyEvents = new Set(
    (await tx.execute<{ k: string }>(sql`select payload->>'legacyId' as k from events where payload ? 'legacyId'`)).map((r) => r.k),
  );

  // ── Customers (decision 1: merge accounts that share an email) ───────
  const customerByAuth0 = new Map<string, string>();
  const customerByUserId = new Map<string, string>();
  const customerByEmail = new Map<string, string>();
  const groups = new Map<string, Row[]>();
  for (const u of d.users) {
    const kind = t.userKind(u);
    if (kind === "staff") {
      report.add("customers", "skipped: staff (added by hand)");
      continue;
    }
    if (kind === "skip") {
      report.skip("customers", "placeholder, seed or no email", String(u.id));
      continue;
    }
    const email = t.lowerEmail(u.email)!;
    groups.set(email, [...(groups.get(email) ?? []), u]);
  }
  for (const [email, group] of groups) {
    if (group.length > 1) report.add("customers", "old accounts merged into another (same email)", group.length - 1);
    const u = t.mergeUsers(group);
    const legacyId = t.groupLegacyId(group);
    const values = {
      email,
      firstName: t.str(u.first_name),
      lastName: t.str(u.last_name),
      phone: t.str(u.phone),
      smsOptIn: t.smsOptIn(u),
      status: u.is_active === false ? ("disabled" as const) : ("active" as const),
      customerType: t.customerType(u),
      onboardedAt: t.bool(u.first_time_login) === false || t.str(u.last_login) ? (t.utc(u.last_login) ?? t.utc(u.created_at)) : null,
    };
    let id = ids.customers.get(legacyId) ?? importedByEmail.get(email);
    if (id) {
      await tx.update(s.customers).set({ ...values, legacyId }).where(eq(s.customers.id, id));
      report.add("customers", "updated");
    } else if ((id = native.customerByEmail.get(email))) {
      report.add("customers", "already in new app (reused)");
    } else {
      const [row] = await tx
        .insert(s.customers)
        .values({ ...values, legacyId, createdAt: t.utc(u.created_at) ?? new Date() })
        .returning({ id: s.customers.id });
      id = row!.id;
      ids.customers.set(legacyId, id);
      report.add("customers", "created");
    }
    customerByEmail.set(email, id);
    for (const g of group) {
      customerByUserId.set(String(g.id), id);
      const a0 = t.str(g.auth0_user_id);
      if (a0) customerByAuth0.set(a0, id);
    }
  }
  const ownerOf = (auth0OrId: unknown): string | null => {
    const k = t.str(auth0OrId);
    return k ? (customerByAuth0.get(k) ?? customerByUserId.get(k) ?? null) : null;
  };

  // ── Addresses ────────────────────────────────────────────────────────
  const addressKeys = new Map<string, Map<string, string>>(); // customer id → address key → address id
  for (const a of await tx.select().from(s.addresses)) {
    const m = addressKeys.get(a.customerId) ?? new Map<string, string>();
    m.set(t.addressKey(a), a.id);
    addressKeys.set(a.customerId, m);
  }
  const putAddress = async (customerId: string, raw: unknown, legacyId: string, makeDefault: boolean): Promise<string | null> => {
    const a = t.normalizeAddress(raw);
    if (!a) {
      if (t.json(raw)) report.skip("addresses", "incomplete (needs street, city, state and ZIP)", legacyId);
      return null;
    }
    const m = addressKeys.get(customerId) ?? new Map<string, string>();
    addressKeys.set(customerId, m);
    const known = ids.addresses.get(legacyId) ?? m.get(t.addressKey(a));
    if (known) return known;
    const [row] = await tx
      .insert(s.addresses)
      .values({ ...a, customerId, legacyId, isDefault: makeDefault && m.size === 0 })
      .returning({ id: s.addresses.id });
    ids.addresses.set(legacyId, row!.id);
    m.set(t.addressKey(a), row!.id);
    report.add("addresses", "created");
    return row!.id;
  };
  for (const u of d.users) {
    const customerId = customerByUserId.get(String(u.id));
    if (!customerId) continue;
    await putAddress(customerId, u.shipping_address, `u:${u.id}:ship`, true);
    await putAddress(customerId, u.billing_address, `u:${u.id}:bill`, false);
  }

  // ── Pets ─────────────────────────────────────────────────────────────
  const breedName = new Map(d.breeds.map((b) => [String(b.id), t.str(b.name)]));
  const referencedPets = new Set(
    [...d.tests.map((x) => t.str(x.animal_id)), ...d.pet_score.map((x) => t.str(x.pet_id))].filter((x): x is string => x !== null),
  );
  const petByOldId = new Map<string, { id: string; species: Species }>();
  for (const p of d.animal) {
    const oldId = String(p.id);
    const customerId = ownerOf(p.owner_user_id);
    if (!customerId) {
      report.skip("pets", "no owner (decision 2)", oldId);
      continue;
    }
    if (t.petDeleted(p) && !referencedPets.has(oldId)) {
      report.skip("pets", "deleted in old app", oldId);
      continue;
    }
    const species = t.petSpecies(p);
    if (!species) {
      report.skip("pets", `not a dog or cat (decision 3)`, `${oldId} (${t.str(p.species) ?? t.str(p.type) ?? "blank"})`);
      continue;
    }
    const weight = Number(p.weight_pounds);
    const values = {
      customerId,
      name: t.str(p.name) ?? "Pet",
      species,
      breed: breedName.get(String(p.breed_id)) ?? t.str(p.breed),
      dateOfBirth: t.petDateOfBirth(p),
      sex: t.petSex(p.gender),
      spayedNeutered: t.bool(p.spayed), // decision 6: as stored
      weightLbs: t.str(p.weight_pounds) !== null && Number.isFinite(weight) ? weight : null,
      microchip: t.str(p.microchip),
      vetNotes: t.str(p.vet_notes),
      notes: t.str(p.additional_notes),
    };
    let id = ids.pets.get(oldId);
    if (id) {
      await tx.update(s.pets).set(values).where(eq(s.pets.id, id));
      report.add("pets", "updated");
    } else {
      const [row] = await tx.insert(s.pets).values({ ...values, legacyId: oldId, createdAt: t.utc(p.created_at) ?? new Date() }).returning({ id: s.pets.id });
      id = row!.id;
      ids.pets.set(oldId, id);
      report.add("pets", "created");
    }
    petByOldId.set(oldId, { id, species });
    if (t.isCustomPhoto(p)) files.push({ kind: "pet_photo", targetId: id, legacyId: oldId, source: t.str(p.photo_url)! });
  }

  // ── Products (one per species and test type) ─────────────────────────
  const products = await tx.select().from(s.products);
  const productFor = async (species: Species, testType: TestType, name: string | null, priceCents: number) => {
    const found =
      products.find((p) => p.species === species && p.testType === testType && p.active) ??
      products.find((p) => p.species === species && p.testType === testType);
    if (found) return found;
    const [row] = await tx
      .insert(s.products)
      .values({
        sku: `LEGACY-${species === "dog" ? "C" : "F"}-${testType.toUpperCase()}`,
        name: name ?? `${species} ${testType} kit`,
        species,
        testType,
        priceCents,
      })
      .returning();
    products.push(row!);
    report.add("products", "created for old orders");
    return row!;
  };

  // ── Orders and line items ────────────────────────────────────────────
  interface OrderRef {
    id: string;
    customerId: string;
    legacy: boolean;
    row: Row;
    status: "open" | "fulfilled" | "cancelled";
  }
  const orderByOldId = new Map<string, OrderRef>();
  const itemByKey = new Map<string, { id: string; species: Species; testType: TestType; quantity: number }>();
  const orderKitsByOrder = new Map<string, Row[]>();
  for (const ok of d.order_kits) orderKitsByOrder.set(String(ok.order_id), [...(orderKitsByOrder.get(String(ok.order_id)) ?? []), ok]);

  for (const o of d.orders) {
    const oldId = String(o.id);
    const email = t.lowerEmail(o.user_email);
    let customerId = ownerOf(o.user_id) ?? (email ? (customerByEmail.get(email) ?? native.customerByEmail.get(email) ?? null) : null);
    if (!customerId && email) {
      // Guest Shopify order: create the customer from the order.
      const ship = t.json<Row>(o.shipping_address) ?? {};
      const legacyId = `guest:${email}`;
      customerId = ids.customers.get(legacyId) ?? null;
      if (!customerId) {
        const [row] = await tx
          .insert(s.customers)
          .values({
            email,
            firstName: t.str(ship.first_name),
            lastName: t.str(ship.last_name),
            phone: t.str(ship.phone),
            legacyId,
            createdAt: t.utc(o.created_at) ?? new Date(),
          })
          .returning({ id: s.customers.id });
        customerId = row!.id;
        ids.customers.set(legacyId, customerId);
        report.add("customers", "created from a guest order");
      }
      customerByEmail.set(email, customerId);
    }
    if (!customerId) {
      report.skip("orders", "no customer and no email (decision 2)", oldId);
      continue;
    }

    const status = t.orderStatus(o.status);
    const shopifyOrderId = t.str(o.shopify_order_id);
    const nativeId = shopifyOrderId ? native.orderByShopifyId.get(shopifyOrderId) : undefined;
    if (nativeId && !ids.orders.get(oldId)) {
      report.add("orders", "already in new app (reused)");
      orderByOldId.set(oldId, { id: nativeId, customerId, legacy: false, row: o, status });
      continue;
    }

    const lines = t.orderLines(o);
    const total = t.cents(o.total_amount);
    const shipping = t.cents(o.shipping_cost);
    const tax = t.cents(o.tax_amount);
    const discount = t.cents(o.discount_amount);
    const linesSum = lines.reduce((n, l) => n + l.unitPriceCents * l.quantity, 0);
    const subtotal = Math.max(0, total - shipping - tax + discount);
    if (lines.length && Math.abs(linesSum - subtotal) > 1) report.skip("orders", "line items don't add up to the order total (kept the total)", oldId);
    const shippingAddressId = await putAddress(customerId, o.shipping_address, `o:${oldId}:ship`, false);
    const placedAt = t.utc(o.created_at) ?? new Date();
    const values = {
      customerId,
      status,
      source: t.orderSource(o),
      subtotalCents: subtotal,
      discountCents: discount,
      shippingCents: shipping,
      taxCents: tax,
      totalCents: total,
      shippingAddressId,
      placedAt,
      cancelledAt: status === "cancelled" ? (t.utc(o.updated_at) ?? placedAt) : null,
      shopifyOrderId,
      legacyOrderNumber: t.str(o.order_id),
    };
    let id = ids.orders.get(oldId);
    if (id) {
      await tx.update(s.orders).set(values).where(eq(s.orders.id, id));
      report.add("orders", "updated");
    } else {
      const [row] = await tx.insert(s.orders).values({ ...values, legacyId: oldId, createdAt: placedAt }).returning({ id: s.orders.id });
      id = row!.id;
      ids.orders.set(oldId, id);
      report.add("orders", "created");
    }
    orderByOldId.set(oldId, { id, customerId, legacy: true, row: o, status });

    // Lines that don't name the species: take it from the order's kit codes.
    const kitSpecies = (orderKitsByOrder.get(oldId) ?? []).map((k) => t.parseLegacyKitCode(upper(k.kit_number)).species).find((x) => x !== null) ?? null;
    for (const line of lines) {
      const key = `${oldId}:${line.index}`;
      const species = line.species ?? kitSpecies;
      if (!species || !line.testType) {
        report.skip("order items", "product not recognised as a dog or cat kit", `${oldId}#${line.index} ${line.name ?? line.sku ?? ""}`.trim());
        continue;
      }
      const product = await productFor(species, line.testType, line.name, line.unitPriceCents);
      const itemValues = { orderId: id, productId: product.id, quantity: line.quantity, unitPriceCents: line.unitPriceCents };
      let itemId = ids.orderItems.get(key);
      if (itemId) {
        await tx.update(s.orderItems).set(itemValues).where(eq(s.orderItems.id, itemId));
        report.add("order items", "updated");
      } else {
        const [row] = await tx.insert(s.orderItems).values({ ...itemValues, legacyId: key }).returning({ id: s.orderItems.id });
        itemId = row!.id;
        ids.orderItems.set(key, itemId);
        report.add("order items", "created");
      }
      itemByKey.set(key, { id: itemId, species, testType: line.testType, quantity: line.quantity });
    }
  }

  // ── Kits ─────────────────────────────────────────────────────────────
  const testByCode = new Map(d.tests.map((x) => [upper(x.kit_code), x]));
  const orderKitByCode = new Map(d.order_kits.filter((x) => t.str(x.kit_number)).map((x) => [upper(x.kit_number), x]));
  const logisticByCode = new Map(d.logistic_kits.filter((x) => t.str(x.kit_id)).map((x) => [upper(x.kit_id), x]));
  const scoreByCode = new Map(d.pet_score.map((x) => [upper(x.test_id), x]));
  const historyByCode = new Map<string, Row[]>();
  for (const h of d.tests_status_history) historyByCode.set(upper(h.kit_code), [...(historyByCode.get(upper(h.kit_code)) ?? []), h]);
  const kitByCode = new Map<string, string>();
  const realKitsPerItem = new Map<string, number>();
  // Codes that reached a customer or an order. Unallocated inventory isn't imported.
  const codes = new Set([...testByCode.keys(), ...orderKitByCode.keys()].filter(Boolean));

  for (const code of codes) {
    const test = testByCode.get(code);
    const ok = orderKitByCode.get(code);
    const order = ok ? orderByOldId.get(String(ok.order_id)) : undefined;
    const lk = logisticByCode.get(code);
    const pet = test ? petByOldId.get(String(test.animal_id)) : undefined;
    const customerId = (test ? ownerOf(test.owner_id) : null) ?? order?.customerId ?? null;
    if (!customerId) {
      report.skip("kits", "no owner (decision 2)", code);
      continue;
    }
    const parsed = t.parseLegacyKitCode(code);
    const itemKey = ok ? `${ok.order_id}:${ok.order_product_index}` : null;
    const item = itemKey ? itemByKey.get(itemKey) : undefined;
    const lkSpecies = t.str(lk?.species)?.toLowerCase();
    const species: Species | null =
      parsed.species ?? (lkSpecies === "canine" ? "dog" : lkSpecies === "feline" ? "cat" : null) ?? pet?.species ?? item?.species ?? null;
    const panel: Panel | null =
      parsed.panel ??
      t.panelFromText(test?.kit_type) ??
      t.panelFromText(ok?.kit_type) ??
      (item && item.testType !== "complete" ? item.testType : null);
    if (!species || !panel) {
      report.skip("kits", "not a dog or cat fecal, oral or respiratory kit (decision 3)", code);
      continue;
    }
    const fromTest = test ? t.kitStatusFromTest(test.status) : null;
    if (test && !fromTest) report.skip("kits", "unknown old status, imported as activated", `${code} (${t.str(test.status)})`);
    let status: KitStatus = test ? (fromTest ?? "activated") : t.kitStatusFromOrder(order?.row);
    const score = scoreByCode.get(code);
    if (score && status !== "cancelled" && status !== "rerun") status = "completed";
    const history = [...(historyByCode.get(code) ?? [])].sort((a, b) => (t.utc(a.changed_at)?.getTime() ?? 0) - (t.utc(b.changed_at)?.getTime() ?? 0));
    const values = {
      code,
      orderId: order?.id ?? null,
      orderItemId: item?.id ?? null,
      customerId,
      petId: pet?.id ?? null,
      species,
      panel,
      status,
      statusChangedAt: t.utc(history.at(-1)?.changed_at) ?? t.utc(test?.updated_at) ?? t.utc(order?.row.updated_at) ?? new Date(),
      shippedAt: t.utc(order?.row.shipped_at),
      activatedAt: t.utc(test?.created_at),
      receivedAt: t.utc(test?.received_at_lab_at),
      completedAt: score ? t.utc(score.created_at) : null,
    };
    if (itemKey && item) realKitsPerItem.set(itemKey, (realKitsPerItem.get(itemKey) ?? 0) + 1);
    const legacyId = `kit:${code}`;
    let id = ids.kits.get(legacyId);
    if (id) {
      await tx.update(s.kits).set(values).where(eq(s.kits.id, id));
      report.add("kits", "updated");
    } else if ((id = native.kitByCode.get(code))) {
      report.add("kits", "already in new app (reused)");
    } else {
      const [row] = await tx
        .insert(s.kits)
        .values({ ...values, legacyId, createdAt: t.utc(test?.created_at) ?? t.utc(ok?.created_at) ?? values.statusChangedAt })
        .returning({ id: s.kits.id });
      id = row!.id;
      ids.kits.set(legacyId, id);
      report.add("kits", "created");
    }
    kitByCode.set(code, id);

    // Kit history → timeline events (decision 8).
    for (const h of history) {
      const key = `tsh:${h.id}`;
      if (legacyEvents.has(key)) continue;
      const by = t.str(h.changed_by);
      await tx.insert(s.events).values({
        entityType: "kit",
        entityId: id,
        type: "kit.status_changed",
        actorType: by ? "staff" : "system",
        actorLabel: by ?? "Old app",
        payload: { to: t.kitStatusFromTest(h.status) ?? t.str(h.status), legacyStatus: t.str(h.status), legacyId: key },
        occurredAt: t.utc(h.changed_at) ?? new Date(),
      });
      legacyEvents.add(key);
      report.add("history", "kit status changes");
    }
  }

  // Open orders whose kits weren't allocated yet get placeholder kits, as Shopify intake creates.
  for (const [key, item] of itemByKey) {
    const oldOrderId = key.slice(0, key.lastIndexOf(":"));
    const order = orderByOldId.get(oldOrderId)!;
    const panels = panelsForTestType(item.testType);
    const needed = order.status === "open" ? Math.max(0, item.quantity * panels.length - (realKitsPerItem.get(key) ?? 0)) : 0;
    const prefix = `ph:${key}:`;
    const stale = [...ids.kits.entries()].filter(([lid]) => lid.startsWith(prefix) && Number(lid.slice(prefix.length)) >= needed);
    if (stale.length) {
      await tx.delete(s.kits).where(inArray(s.kits.id, stale.map(([, id]) => id)));
      for (const [lid] of stale) ids.kits.delete(lid);
      report.add("kits", "placeholders removed (real kits now allocated)", stale.length);
    }
    for (let n = 0; n < needed; n++) {
      const lid = `${prefix}${n}`;
      if (ids.kits.has(lid)) continue;
      const [row] = await tx
        .insert(s.kits)
        .values({
          orderId: order.id,
          orderItemId: item.id,
          customerId: order.customerId,
          species: item.species,
          panel: panels[n % panels.length]!,
          status: "ordered",
          legacyId: lid,
          statusChangedAt: t.utc(order.row.created_at) ?? new Date(),
        })
        .returning({ id: s.kits.id });
      ids.kits.set(lid, row!.id);
      report.add("kits", "placeholders for kits not yet allocated");
    }
  }

  // ── Shipments ────────────────────────────────────────────────────────
  const putShipment = async (legacyId: string, naturalKeys: string[], values: Omit<typeof s.shipments.$inferInsert, "legacyId">, kitIds: string[]) => {
    let id = ids.shipments.get(legacyId);
    if (id) {
      await tx.update(s.shipments).set(values).where(eq(s.shipments.id, id));
      report.add("shipments", "updated");
    } else if ((id = naturalKeys.map((k) => native.shipmentByKey.get(k)).find(Boolean))) {
      report.add("shipments", "already in new app (reused)");
      return id;
    } else {
      const [row] = await tx.insert(s.shipments).values({ ...values, legacyId }).returning({ id: s.shipments.id });
      id = row!.id;
      ids.shipments.set(legacyId, id);
      for (const k of naturalKeys) native.shipmentByKey.set(k, id);
      report.add("shipments", `created (${values.direction})`);
    }
    if (kitIds.length) await tx.insert(s.shipmentKits).values(kitIds.map((kitId) => ({ shipmentId: id!, kitId }))).onConflictDoNothing();
    return id;
  };

  const kitsOfOrder = new Map<string, string[]>();
  for (const [code, kitId] of kitByCode) {
    const ok = orderKitByCode.get(code);
    if (ok) kitsOfOrder.set(String(ok.order_id), [...(kitsOfOrder.get(String(ok.order_id)) ?? []), kitId]);
  }
  for (const [oldId, order] of orderByOldId) {
    const o = order.row;
    const tn = t.str(o.tracking_number);
    if (!tn || !order.legacy) continue;
    const carrier = t.carrierName(o.carrier);
    await putShipment(
      `o:${oldId}`,
      [`${carrier}|${tn}`],
      {
        direction: "outbound",
        carrier,
        trackingNumber: tn,
        trackingUrl: t.str(o.tracking_url),
        customerId: order.customerId,
        orderId: order.id,
        status: t.trackingStatus(o.tracking_status, o.delivered_at),
        pickedUpAt: t.utc(o.shipped_at),
        deliveredAt: t.utc(o.delivered_at),
        createdAt: t.utc(o.shipped_at) ?? t.utc(o.updated_at) ?? new Date(),
      },
      kitsOfOrder.get(oldId) ?? [],
    );
  }

  const kitsOfReturn = new Map<string, string[]>();
  for (const test of d.tests) {
    const rid = t.str(test.fedex_return_shipment_id);
    const kitId = kitByCode.get(upper(test.kit_code));
    if (rid && kitId) kitsOfReturn.set(rid, [...(kitsOfReturn.get(rid) ?? []), kitId]);
  }
  for (const r of d.fedex_return_shipments) {
    const rid = String(r.id);
    const customerId = ownerOf(r.owner_user_id) ?? customerByEmail.get(t.lowerEmail(r.customer_email) ?? "") ?? null;
    if (!customerId) {
      report.skip("shipments", "return with no owner (decision 2)", rid);
      continue;
    }
    const tn = t.str(r.tracking_number);
    const rma = t.str(r.rma_number);
    const label = t.str(r.qr_image_url);
    const id = await putShipment(
      `f:${rid}`,
      [...(tn ? [`fedex|${tn}`] : []), ...(rma ? [`rma|${rma}`] : [])],
      {
        direction: "return",
        carrier: "fedex",
        rmaNumber: rma,
        trackingNumber: tn,
        customerId,
        status: t.returnShipmentStatus(r.status),
        statusDetail: t.str(r.fedex_status),
        error: t.str(r.last_error),
        labelFormat: label ? "qr_png" : null,
        pickedUpAt: t.utc(r.first_scan_at),
        lastTrackedAt: t.utc(r.last_synced_at),
        createdAt: t.utc(r.created_at) ?? new Date(),
      },
      kitsOfReturn.get(rid) ?? [],
    );
    if (label) files.push({ kind: "return_label", targetId: id, legacyId: `f:${rid}`, source: label });
  }
  // Older returns (before FedEx returns): tracking stored on the kit itself.
  for (const test of d.tests) {
    const tn = t.str(test.tracking_number);
    if (!tn || t.str(test.fedex_return_shipment_id)) continue;
    const kitId = kitByCode.get(upper(test.kit_code));
    const customerId = ownerOf(test.owner_id);
    if (!kitId || !customerId) continue;
    const carrier = t.carrierName(test.carrier);
    await putShipment(
      `r:${carrier}:${tn}`,
      [`${carrier}|${tn}`],
      {
        direction: "return",
        carrier,
        trackingNumber: tn,
        trackingUrl: t.str(test.tracking_url),
        customerId,
        status: t.trackingStatus(test.tracking_status, test.delivered_at),
        pickedUpAt: t.utc(test.shipped_at),
        deliveredAt: t.utc(test.delivered_at),
        createdAt: t.utc(test.shipped_at) ?? t.utc(test.updated_at) ?? new Date(),
      },
      [kitId],
    );
  }

  // ── Lab results and AI summaries ─────────────────────────────────────
  const pdfByCode = new Map(d.pdf_reports.map((p) => [upper(p.test_id ?? p.kit_code), t.str(p.s3_url) ?? t.str(p.pdf_url)]));
  for (const score of d.pet_score) {
    const code = upper(score.test_id);
    const kitId = kitByCode.get(code);
    if (!kitId) {
      report.skip("lab results", "kit not imported (no owner, or not a supported panel)", code);
      continue;
    }
    const legacyId = `ps:${score.id}`;
    const reportedAt = t.utc(score.created_at) ?? new Date();
    const values = {
      kitId,
      status: "released" as const,
      healthStatus: t.healthStatus(score.health_status),
      panelCode: t.str(score.kit_type),
      targets: t.targetsFromScore(score),
      raw: t.withoutPii(score),
      reportedAt,
      releasedAt: reportedAt,
    };
    let id = ids.labResults.get(legacyId);
    if (id) {
      await tx.update(s.labResults).set(values).where(eq(s.labResults.id, id));
      report.add("lab results", "updated");
    } else {
      const [row] = await tx.insert(s.labResults).values({ ...values, legacyId, createdAt: reportedAt }).returning({ id: s.labResults.id });
      id = row!.id;
      ids.labResults.set(legacyId, id);
      report.add("lab results", "created");
    }
    const pdf = t.str(score.pdf_s3_url) ?? pdfByCode.get(code) ?? null;
    if (pdf) files.push({ kind: "report_pdf", targetId: id, legacyId, source: pdf });

    // The old app showed its AI text to customers, so it's imported as approved.
    const summary = t.legacySummary(score);
    if (summary) {
      const aiValues = { labResultId: id, version: 1, model: "legacy", content: summary, reviewedAt: reportedAt };
      const aiId = ids.aiReports.get(legacyId);
      if (aiId) {
        await tx.update(s.aiReports).set(aiValues).where(eq(s.aiReports.id, aiId));
        report.add("AI summaries", "updated");
      } else {
        const [row] = await tx.insert(s.aiReports).values({ ...aiValues, legacyId, createdAt: reportedAt }).returning({ id: s.aiReports.id });
        ids.aiReports.set(legacyId, row!.id);
        report.add("AI summaries", "created");
      }
    }
  }

  // ── Rerun queue (open items only) ────────────────────────────────────
  for (const q of d.lab_rerun_queue) {
    const status = t.rerunStatus(q.status);
    if (status === "resolved") {
      report.add("reruns", "skipped: already resolved");
      continue;
    }
    const kitId = kitByCode.get(upper(q.kit_code));
    if (!kitId) {
      report.skip("reruns", "kit not imported", String(q.id));
      continue;
    }
    const legacyId = `rq:${q.id}`;
    const values = {
      kitId,
      target: t.str(q.target_key) ?? "unknown",
      reason: [t.str(q.reason_code), t.str(q.reason_note)].filter(Boolean).join(": ") || null,
      attempts: Number(q.attempt_count) || 1,
      status,
    };
    const id = ids.rerunQueue.get(legacyId);
    if (id) {
      await tx.update(s.rerunQueue).set(values).where(eq(s.rerunQueue.id, id));
      report.add("reruns", "updated");
    } else {
      const [row] = await tx
        .insert(s.rerunQueue)
        .values({ ...values, legacyId, createdAt: t.utc(q.created_at) ?? new Date() })
        .returning({ id: s.rerunQueue.id });
      ids.rerunQueue.set(legacyId, row!.id);
      report.add("reruns", "created");
    }
  }

  // ── Order comments → order notes (decision 8) ────────────────────────
  for (const c of d.order_comments) {
    const order = orderByOldId.get(String(c.order_id));
    if (!order?.legacy) continue;
    const list = t.json<unknown[]>(c.comments) ?? [];
    for (const [i, item] of list.entries()) {
      const note = t.json<Row>(item) ?? {};
      const message = t.str(note.message);
      const key = `oc:${c.id}:${i}`;
      if (!message || legacyEvents.has(key)) continue;
      await tx.insert(s.events).values({
        entityType: "order",
        entityId: order.id,
        type: "order.note",
        actorType: "staff",
        actorLabel: t.str(note.author) ?? "Old app",
        payload: { note: message, legacyId: key },
        occurredAt: t.utc(note.created_at) ?? t.utc(c.created_at) ?? new Date(),
      });
      legacyEvents.add(key);
      report.add("history", "order notes");
    }
  }

  await reconcile(tx, d, report);
}

/** Totals to compare old against new. */
async function reconcile(tx: Tx, d: LegacyData, report: Report) {
  const oldOrders = d.orders.filter((o) => t.orderStatus(o.status) !== "cancelled");
  const oldRevenue = oldOrders.reduce((n, o) => n + t.cents(o.total_amount), 0);
  const [rev] = await tx.execute<{ cents: string | null; n: string }>(
    sql`select coalesce(sum(total_cents), 0)::text as cents, count(*)::text as n from orders where legacy_id is not null and status <> 'cancelled'`,
  );
  report.add("reconciliation", "old orders, not cancelled", oldOrders.length);
  report.add("reconciliation", "imported orders, not cancelled", Number(rev?.n ?? 0));
  report.add("reconciliation", "old revenue, not cancelled ($)", Math.round(oldRevenue / 100));
  report.add("reconciliation", "imported revenue, not cancelled ($)", Math.round(Number(rev?.cents ?? 0) / 100));
  const kitCounts = await tx.execute<{ status: string; n: string }>(
    sql`select status::text, count(*)::text as n from kits where legacy_id like 'kit:%' group by status order by status`,
  );
  for (const k of kitCounts) report.add("reconciliation", `imported kits: ${k.status}`, Number(k.n));
}

// ── CLI ────────────────────────────────────────────────────────────────

function sameDatabase(a: string, b: string): boolean {
  const x = new URL(a);
  const y = new URL(b);
  return x.hostname === y.hostname && x.port === y.port && x.pathname === y.pathname;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const m = args.indexOf("--manifest");
  const manifestAt = m >= 0 && args[m + 1] ? args[m + 1]! : "legacy-files.json";
  const source = process.env.LEGACY_DATABASE_URL;
  const target = process.env.DATABASE_URL;
  if (!source) throw new Error("Set LEGACY_DATABASE_URL to the old database (read replica).");
  if (!target) throw new Error("Set DATABASE_URL to the database to import into.");
  if (sameDatabase(source, target)) throw new Error("LEGACY_DATABASE_URL and DATABASE_URL point at the same database.");

  console.log("Reading the old database (read-only)…");
  const data = await readLegacy(source);
  console.log(`\nImporting into ${new URL(target).hostname}${new URL(target).pathname}${apply ? "" : " (dry run: nothing is saved)"}…`);
  const { report, files } = await runImport(data, { apply });
  report.print(apply ? "Imported:" : "Dry run, would import:");
  writeFileSync(manifestAt, JSON.stringify(files, null, 2));
  console.log(`\n${files.length} files to copy from S3 listed in ${manifestAt}`);
  if (!apply) console.log("Nothing was saved. Run again with --apply to import.");
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
