/**
 * Development seed: realistic, deterministic fake data covering every kit
 * status so each admin screen has something to show.
 *
 *   pnpm db:seed
 *
 * ⚠ Clears all tables first. Refuses to run against production.
 */
import { faker } from "@faker-js/faker";
import { sql } from "drizzle-orm";
import {
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_LABEL,
  ROLE_KEYS,
  SPECIES_LABEL,
  formatKitCode,
  milestoneFieldFor,
  notificationForStatus,
  panelsForTestType,
  type KitStatus,
  type Panel,
  type Species,
  type TestType,
} from "@petwealth/domain";
import { getDb } from "./client";
import * as s from "./schema";

if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed a production database.");
}

faker.seed(20261121);
const db = getDb();
const NOW = Date.now();
const DAY = 86_400_000;

const DOG_BREEDS = ["Golden Retriever", "Labrador Retriever", "French Bulldog", "Border Collie", "Siberian Husky", "Shiba Inu", "Miniature Schnauzer", "Australian Labradoodle", "Yorkiepoo", "German Shepherd Dog", "Dachshund", "Mixed breed"];
const CAT_BREEDS = ["Domestic Shorthair", "Maine Coon", "Bengal", "Sphynx", "Siamese", "Ragdoll", "British Shorthair", "Persian", "Domestic Longhair"];

/** The usual path a kit takes; the seed walks it up to a target status. */
const HAPPY_PATH: KitStatus[] = ["ordered", "label_created", "shipped", "delivered", "activated", "assigned", "sample_collected", "in_transit", "received_at_lab", "processing", "completed"];

/** Older orders are further along. Returns the status a kit should end up in. */
function targetStatusForAge(ageDays: number): KitStatus {
  const r = faker.number.float();
  if (r < 0.03) return "cancelled";
  if (ageDays > 35) return r < 0.06 ? "rerun" : "completed";
  if (ageDays > 21) return faker.helpers.arrayElement(["received_at_lab", "processing", "completed", "completed"]);
  if (ageDays > 10) return faker.helpers.arrayElement(["assigned", "sample_collected", "in_transit", "received_at_lab"]);
  if (ageDays > 3) return faker.helpers.arrayElement(["shipped", "delivered", "activated", "assigned"]);
  return faker.helpers.arrayElement(["ordered", "label_created", "shipped"]);
}

const trackingNumber = () => faker.string.numeric(12);

async function main() {
  console.log("Clearing tables…");
  await db.execute(
    sql.raw(
      "TRUNCATE events, notifications, rerun_queue, ai_reports, lab_results, lab_batches, shipment_labels, shipment_kits, shipments, webhook_events, kits, order_items, orders, products, pets, addresses, customers, staff_users, role_permissions, roles RESTART IDENTITY CASCADE",
    ),
  );

  // ── Roles & staff ────────────────────────────────────────────────────
  await db.insert(s.roles).values(ROLE_KEYS.map((key) => ({ key, name: ROLE_LABEL[key] })));
  await db.insert(s.rolePermissions).values(
    Object.entries(DEFAULT_ROLE_PERMISSIONS).flatMap(([role, perms]) =>
      perms.map((permission) => ({ role: role as (typeof ROLE_KEYS)[number], permission })),
    ),
  );
  const superAdminEmail = (process.env.SEED_SUPER_ADMIN_EMAIL ?? "admin@petwealth.com").toLowerCase();
  const staffSeed = [
    { email: superAdminEmail, name: "Petwealth Admin", role: "super_admin" as const },
    { email: "manager@petwealth.com", name: "Morgan Manager", role: "manager" as const },
    { email: "ops@petwealth.com", name: "Olivia Ops", role: "ops" as const },
    { email: "support@petwealth.com", name: "Sam Support", role: "customer_support" as const },
    { email: "lab@petwealth.com", name: "Lee Labtech", role: "lab_tech" as const },
  ];
  const staff = await db
    .insert(s.staffUsers)
    .values(
      staffSeed.map((u, i) => ({
        ...u,
        status: i < 4 ? ("active" as const) : ("invited" as const),
        lastLoginAt: i < 4 ? new Date(NOW - i * DAY) : null,
      })),
    )
    .returning();
  const labTech = staff.find((u) => u.role === "lab_tech")!;

  // ── Catalog (placeholder prices until Shopify sync lands) ────────────
  const PRICE: Record<TestType, number> = { fecal: 9900, respiratory: 12900, oral: 8900, complete: 27900 };
  const products = await db
    .insert(s.products)
    .values(
      (["dog", "cat"] as Species[]).flatMap((species) =>
        (["fecal", "respiratory", "oral", "complete"] as TestType[]).map((testType) => ({
          sku: `${species === "dog" ? "C" : "F"}-${testType.toUpperCase()}`,
          name: `${SPECIES_LABEL[species].noun} ${testType[0]!.toUpperCase()}${testType.slice(1)} Health Kit`,
          species,
          testType,
          priceCents: PRICE[testType],
        })),
      ),
    )
    .returning();

  // ── Customers, addresses, pets ───────────────────────────────────────
  console.log("Customers & pets…");
  const customers = await db
    .insert(s.customers)
    .values(
      Array.from({ length: 140 }, (_, i) => {
        const firstName = faker.person.firstName();
        const lastName = faker.person.lastName();
        return {
          firstName,
          lastName,
          email: `${firstName}.${lastName}.${i}@example.com`.toLowerCase().replace(/[^a-z0-9.@]/g, ""),
          phone:
            faker.helpers.maybe(() => `+1${faker.string.numeric({ length: 10, allowLeadingZeros: false })}`, {
              probability: 0.85,
            }) ?? null,
          smsOptIn: faker.datatype.boolean(0.7),
          createdAt: new Date(NOW - faker.number.int({ min: 1, max: 160 }) * DAY),
        };
      }),
    )
    .returning();

  const addresses = await db
    .insert(s.addresses)
    .values(
      customers.map((c) => ({
        customerId: c.id,
        line1: faker.location.streetAddress(),
        city: faker.location.city(),
        region: faker.location.state({ abbreviated: true }),
        postalCode: faker.location.zipCode("#####"),
        isDefault: true,
      })),
    )
    .returning();
  const addressByCustomer = new Map(addresses.map((a) => [a.customerId, a.id]));

  const pets = await db
    .insert(s.pets)
    .values(
      customers.flatMap((c) =>
        Array.from(
          {
            length: faker.helpers.weightedArrayElement([
              { value: 1, weight: 6 },
              { value: 2, weight: 3 },
              { value: 3, weight: 1 },
            ]),
          },
          () => {
            const species = faker.helpers.arrayElement<Species>(["dog", "cat"]);
            return {
              customerId: c.id,
              name: faker.animal.petName(),
              species,
              breed: faker.helpers.arrayElement(species === "dog" ? DOG_BREEDS : CAT_BREEDS),
              dateOfBirth: faker.date.birthdate({ mode: "age", min: 0, max: 14 }).toISOString().slice(0, 10),
              createdAt: c.createdAt,
            };
          },
        ),
      ),
    )
    .returning();
  const petsByCustomer = new Map<string, typeof pets>();
  for (const p of pets) petsByCustomer.set(p.customerId, [...(petsByCustomer.get(p.customerId) ?? []), p]);

  // ── Orders, kits, shipments, events ──────────────────────────────────
  console.log("Orders & kits…");
  const serials = new Map<string, number>();
  const nextKitCode = (species: Species, panel: Panel) => {
    const key = `${species}-${panel}`;
    const n = (serials.get(key) ?? 0) + 1;
    serials.set(key, n);
    return formatKitCode(species, panel, 2 + Math.floor(n / 900), (n % 900) + 100);
  };

  let orderCount = 0;
  let kitCount = 0;
  for (const customer of customers) {
    const customerPets = petsByCustomer.get(customer.id) ?? [];
    const orderTotal = faker.helpers.weightedArrayElement([
      { value: 0, weight: 2 },
      { value: 1, weight: 6 },
      { value: 2, weight: 2 },
    ]);
    for (let o = 0; o < orderTotal; o++) {
      const pet = faker.helpers.arrayElement(customerPets);
      const product = faker.helpers.arrayElement(products.filter((p) => p.species === pet.species));
      const ageDays = faker.number.float({ min: 0.1, max: 120 });
      const placedAt = new Date(NOW - ageDays * DAY);
      const discount = faker.helpers.maybe(() => Math.round(product.priceCents * 0.1), { probability: 0.2 }) ?? 0;
      const tax = Math.round((product.priceCents - discount) * 0.0725);

      const [order] = await db
        .insert(s.orders)
        .values({
          shopifyOrderId: faker.string.numeric(13),
          shopifyOrderName: `#${1000 + orderCount}`,
          customerId: customer.id,
          source: faker.helpers.weightedArrayElement([
            { value: "shopify" as const, weight: 9 },
            { value: "wholesale" as const, weight: 1 },
          ]),
          subtotalCents: product.priceCents,
          discountCents: discount,
          taxCents: tax,
          totalCents: product.priceCents - discount + tax,
          shippingAddressId: addressByCustomer.get(customer.id),
          placedAt,
          createdAt: placedAt,
        })
        .returning();
      const [item] = await db
        .insert(s.orderItems)
        .values({ orderId: order!.id, productId: product.id, unitPriceCents: product.priceCents })
        .returning();
      orderCount++;

      await db.insert(s.events).values({
        entityType: "order",
        entityId: order!.id,
        type: "order.created",
        actorType: "integration",
        actorLabel: "Shopify",
        payload: { shopifyOrderName: order!.shopifyOrderName, totalCents: order!.totalCents },
        occurredAt: placedAt,
      });

      const target = targetStatusForAge(ageDays);
      for (const panel of panelsForTestType(product.testType)) {
        const steps: KitStatus[] =
          target === "cancelled"
            ? ["ordered", "label_created", "cancelled"]
            : target === "rerun"
              ? [...HAPPY_PATH.slice(0, HAPPY_PATH.indexOf("processing") + 1), "rerun"]
              : HAPPY_PATH.slice(0, HAPPY_PATH.indexOf(target) + 1);
        if (steps.includes("sample_collected") && faker.datatype.boolean(0.3)) {
          steps.splice(steps.indexOf("sample_collected"), 1);
        }

        const stepGap = Math.max(ageDays * DAY - 3_600_000, 60_000) / steps.length;
        const times = steps.map(
          (_, i) =>
            new Date(placedAt.getTime() + i * stepGap + faker.number.int({ min: 0, max: Math.floor(stepGap * 0.5) })),
        );
        const status = steps.at(-1)!;
        // Codes are linked when the customer scans the tube to register it.
        const hasCode = steps.includes("activated");
        const milestones: Record<string, Date> = {};
        steps.forEach((st, i) => {
          const field = milestoneFieldFor(st);
          if (field) milestones[field] = times[i]!;
        });

        const [kit] = await db
          .insert(s.kits)
          .values({
            code: hasCode ? nextKitCode(pet.species, panel) : null,
            orderId: order!.id,
            orderItemId: item!.id,
            customerId: customer.id,
            petId: steps.includes("assigned") ? pet.id : null,
            species: pet.species,
            panel,
            status,
            statusChangedAt: times.at(-1)!,
            ...milestones,
            createdAt: placedAt,
          })
          .returning();
        kitCount++;

        if (steps.length > 1) {
          await db.insert(s.events).values(
            steps.slice(1).map((to, i) => {
              const byLab = ["received_at_lab", "processing", "completed", "rerun", "cancelled"].includes(to);
              const byCustomer = ["activated", "assigned", "sample_collected"].includes(to);
              return {
                entityType: "kit",
                entityId: kit!.id,
                type: "kit.status_changed",
                actorType: byLab ? ("staff" as const) : byCustomer ? ("customer" as const) : ("integration" as const),
                actorLabel: byLab ? labTech.email : byCustomer ? customer.email : "FedEx",
                payload: { from: steps[i], to, ...(to === "assigned" ? { petName: pet.name } : {}) },
                occurredAt: times[i + 1]!,
              };
            }),
          );
        }

        // Outbound box once shipped; return mailer (RMA + QR) once the customer registered the kit.
        const shipmentRows = [
          steps.includes("shipped") && {
            direction: "outbound" as const,
            status: steps.includes("delivered") ? ("delivered" as const) : ("in_transit" as const),
          },
          steps.includes("assigned") && {
            direction: "return" as const,
            labelFormat: "qr_png",
            status: steps.includes("received_at_lab")
              ? ("delivered" as const)
              : steps.includes("in_transit")
                ? ("in_transit" as const)
                : ("label_created" as const),
          },
        ].filter((r) => r !== false);
        for (const row of shipmentRows) {
          const [sh] = await db
            .insert(s.shipments)
            .values({ ...row, customerId: customer.id, orderId: order!.id, trackingNumber: trackingNumber() })
            .returning();
          if (row.direction === "return") {
            await db
              .update(s.shipments)
              .set({ rmaNumber: `PWR${String(sh!.number).padStart(7, "0")}` })
              .where(sql`${s.shipments.id} = ${sh!.id}`);
          }
          await db.insert(s.shipmentKits).values({ shipmentId: sh!.id, kitId: kit!.id });
        }

        const notes = steps.flatMap((st, i) => {
          const template = notificationForStatus(st);
          return template ? [{ template, at: times[i]! }] : [];
        });
        if (notes.length) {
          await db.insert(s.notifications).values(
            notes.map((n) => ({
              customerId: customer.id,
              kitId: kit!.id,
              channel: "email" as const,
              template: n.template,
              status: "sent" as const,
              sentAt: n.at,
              createdAt: n.at,
            })),
          );
        }

        if (status === "completed" || status === "rerun") {
          await db.insert(s.labResults).values({
            kitId: kit!.id,
            healthStatus:
              status === "rerun"
                ? null
                : faker.helpers.weightedArrayElement([
                    { value: "clean" as const, weight: 40 },
                    { value: "needs_attention" as const, weight: 58 },
                    { value: "critical" as const, weight: 2 },
                  ]),
            raw: { panel, source: "seed" },
            reportedAt: times.at(-1)!,
            releasedAt: status === "completed" ? times.at(-1)! : null,
          });
        }
        if (status === "rerun") {
          await db.insert(s.rerunQueue).values({ kitId: kit!.id, target: `${panel}-panel`, reason: "Low DNA yield" });
        }
      }
      if (target === "completed") {
        await db.update(s.orders).set({ status: "fulfilled" }).where(sql`${s.orders.id} = ${order!.id}`);
      }
      if (target === "cancelled") {
        await db.update(s.orders).set({ status: "refunded" }).where(sql`${s.orders.id} = ${order!.id}`);
      }
    }
  }

  console.log(
    `✔ seeded ${customers.length} customers, ${pets.length} pets, ${orderCount} orders, ${kitCount} kits, ${staff.length} staff`,
  );
  console.log(`  super admin: ${superAdminEmail}`);
}

await main();
await db.$client.end();
