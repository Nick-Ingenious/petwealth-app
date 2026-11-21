/**
 * PetWealth database schema.
 *
 * Conventions
 * - Primary keys are UUIDv7-style random UUIDs (`gen_random_uuid()`); human
 *   identifiers (kit codes, order numbers) are separate unique columns.
 * - Money is integer cents. Timestamps are `timestamptz`.
 * - Columns are camelCase in TS and snake_case in SQL (Drizzle `casing`).
 * - `legacy_id` columns hold the primary key from the old AWS database so the
 *   migration is idempotent and traceable.
 * - Status changes are recorded in the append-only `events` table.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { KIT_STATUSES, PANELS, ROLE_KEYS, SPECIES, TEST_TYPES } from "@petwealth/domain";

// ── Enums ──────────────────────────────────────────────────────────────
export const speciesEnum = pgEnum("species", SPECIES);
export const panelEnum = pgEnum("panel", PANELS);
export const testTypeEnum = pgEnum("test_type", TEST_TYPES);
export const kitStatusEnum = pgEnum("kit_status", KIT_STATUSES);
export const roleKeyEnum = pgEnum("role_key", ROLE_KEYS);
export const staffStatusEnum = pgEnum("staff_status", ["invited", "active", "disabled"]);
export const customerStatusEnum = pgEnum("customer_status", ["active", "disabled"]);
export const orderStatusEnum = pgEnum("order_status", ["open", "fulfilled", "cancelled", "refunded"]);
export const orderSourceEnum = pgEnum("order_source", ["shopify", "wholesale", "manual", "legacy"]);
export const shipmentDirectionEnum = pgEnum("shipment_direction", ["outbound", "return"]);
export const shipmentStatusEnum = pgEnum("shipment_status", [
  "label_created",
  "in_transit",
  "delivered",
  "exception",
  "voided",
]);
export const labBatchStatusEnum = pgEnum("lab_batch_status", ["uploaded", "reviewed", "released", "rejected"]);
export const healthStatusEnum = pgEnum("health_status", ["clean", "needs_attention", "critical"]);
export const rerunStatusEnum = pgEnum("rerun_status", ["active", "escalated", "resolved"]);
export const notificationChannelEnum = pgEnum("notification_channel", ["sms", "email", "push"]);
export const notificationStatusEnum = pgEnum("notification_status", ["queued", "sent", "delivered", "failed", "skipped"]);
export const actorTypeEnum = pgEnum("actor_type", ["staff", "customer", "system", "integration"]);

const id = () => uuid().primaryKey().default(sql`gen_random_uuid()`);
const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ── Staff & RBAC ───────────────────────────────────────────────────────
export const roles = pgTable("roles", {
  key: roleKeyEnum().primaryKey(),
  name: text().notNull(),
  description: text(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    role: roleKeyEnum()
      .notNull()
      .references(() => roles.key, { onDelete: "cascade" }),
    permission: text().notNull(),
    grantedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.role, t.permission] })],
);

export const staffUsers = pgTable(
  "staff_users",
  {
    id: id(),
    clerkUserId: text().unique(),
    email: text().notNull(),
    name: text(),
    role: roleKeyEnum()
      .notNull()
      .references(() => roles.key),
    status: staffStatusEnum().notNull().default("invited"),
    lastLoginAt: timestamp({ withTimezone: true }),
    invitedById: uuid(),
    ...timestamps,
  },
  (t) => [uniqueIndex("staff_users_email_idx").on(sql`lower(${t.email})`)],
);

// ── Customers & pets ───────────────────────────────────────────────────
export const customers = pgTable(
  "customers",
  {
    id: id(),
    /** Human-friendly reference shown to staff, e.g. CUS-938. */
    number: integer().generatedAlwaysAsIdentity({ startWith: 1000 }).unique(),
    clerkUserId: text().unique(),
    shopifyCustomerId: text().unique(),
    email: text().notNull(),
    firstName: text(),
    lastName: text(),
    phone: text(),
    smsOptIn: boolean().notNull().default(false),
    status: customerStatusEnum().notNull().default("active"),
    legacyId: text().unique(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("customers_email_idx").on(sql`lower(${t.email})`),
    index("customers_name_idx").on(t.lastName, t.firstName),
  ],
);

export const addresses = pgTable("addresses", {
  id: id(),
  customerId: uuid()
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  line1: text().notNull(),
  line2: text(),
  city: text().notNull(),
  region: text().notNull(),
  postalCode: text().notNull(),
  country: text().notNull().default("US"),
  isDefault: boolean().notNull().default(false),
  ...timestamps,
});

export const pets = pgTable(
  "pets",
  {
    id: id(),
    number: integer().generatedAlwaysAsIdentity({ startWith: 1000 }).unique(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    name: text().notNull(),
    species: speciesEnum().notNull(),
    breed: text(),
    dateOfBirth: date(),
    photoUrl: text(),
    legacyId: text().unique(),
    ...timestamps,
  },
  (t) => [index("pets_customer_idx").on(t.customerId), index("pets_species_idx").on(t.species)],
);

// ── Catalog & orders ───────────────────────────────────────────────────
export const products = pgTable("products", {
  id: id(),
  sku: text().notNull().unique(),
  shopifyVariantId: text().unique(),
  name: text().notNull(),
  species: speciesEnum().notNull(),
  testType: testTypeEnum().notNull(),
  priceCents: integer().notNull(),
  active: boolean().notNull().default(true),
  ...timestamps,
});

export const orders = pgTable(
  "orders",
  {
    id: id(),
    /** Display number, e.g. PW-10234. Shopify's name is kept separately. */
    number: integer().generatedAlwaysAsIdentity({ startWith: 10000 }).unique(),
    shopifyOrderId: text().unique(),
    shopifyOrderName: text(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    status: orderStatusEnum().notNull().default("open"),
    source: orderSourceEnum().notNull(),
    subtotalCents: integer().notNull(),
    discountCents: integer().notNull().default(0),
    shippingCents: integer().notNull().default(0),
    taxCents: integer().notNull().default(0),
    totalCents: integer().notNull(),
    shippingAddressId: uuid().references(() => addresses.id),
    placedAt: timestamp({ withTimezone: true }).notNull(),
    legacyId: text().unique(),
    ...timestamps,
  },
  (t) => [index("orders_customer_idx").on(t.customerId), index("orders_placed_at_idx").on(t.placedAt)],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    quantity: integer().notNull().default(1),
    unitPriceCents: integer().notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

// ── Kits & shipping ────────────────────────────────────────────────────
export const kits = pgTable(
  "kits",
  {
    id: id(),
    /** Printed code, e.g. FFEC-002-946. Null until a physical kit is allocated. */
    code: text().unique(),
    orderId: uuid().references(() => orders.id, { onDelete: "restrict" }),
    orderItemId: uuid().references(() => orderItems.id, { onDelete: "restrict" }),
    customerId: uuid().references(() => customers.id, { onDelete: "restrict" }),
    petId: uuid().references(() => pets.id, { onDelete: "set null" }),
    species: speciesEnum().notNull(),
    panel: panelEnum().notNull(),
    status: kitStatusEnum().notNull().default("ordered"),
    statusChangedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    shippedAt: timestamp({ withTimezone: true }),
    activatedAt: timestamp({ withTimezone: true }),
    receivedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    legacyId: text().unique(),
    ...timestamps,
  },
  (t) => [
    index("kits_status_idx").on(t.status),
    index("kits_order_idx").on(t.orderId),
    index("kits_customer_idx").on(t.customerId),
    index("kits_pet_idx").on(t.petId),
  ],
);

export const shipments = pgTable(
  "shipments",
  {
    id: id(),
    kitId: uuid()
      .notNull()
      .references(() => kits.id, { onDelete: "cascade" }),
    direction: shipmentDirectionEnum().notNull(),
    carrier: text().notNull().default("fedex"),
    trackingNumber: text().notNull(),
    labelUrl: text(),
    status: shipmentStatusEnum().notNull().default("label_created"),
    lastCarrierEventAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("shipments_tracking_idx").on(t.carrier, t.trackingNumber),
    index("shipments_kit_idx").on(t.kitId),
  ],
);

// ── Lab ────────────────────────────────────────────────────────────────
export const labBatches = pgTable("lab_batches", {
  id: id(),
  number: integer().generatedAlwaysAsIdentity().unique(),
  filename: text().notNull(),
  blobUrl: text(),
  status: labBatchStatusEnum().notNull().default("uploaded"),
  uploadedById: uuid().references(() => staffUsers.id),
  releasedById: uuid().references(() => staffUsers.id),
  releasedAt: timestamp({ withTimezone: true }),
  ...timestamps,
});

export const labResults = pgTable(
  "lab_results",
  {
    id: id(),
    kitId: uuid()
      .notNull()
      .references(() => kits.id, { onDelete: "restrict" }),
    batchId: uuid().references(() => labBatches.id, { onDelete: "set null" }),
    healthStatus: healthStatusEnum(),
    /** Parsed lab row(s), stored verbatim for traceability. */
    raw: jsonb().$type<Record<string, unknown>>().notNull(),
    pdfUrl: text(),
    reportedAt: timestamp({ withTimezone: true }).notNull(),
    releasedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("lab_results_kit_idx").on(t.kitId), index("lab_results_health_idx").on(t.healthStatus)],
);

export const aiReports = pgTable("ai_reports", {
  id: id(),
  labResultId: uuid()
    .notNull()
    .references(() => labResults.id, { onDelete: "cascade" }),
  version: integer().notNull().default(1),
  model: text().notNull(),
  content: jsonb().$type<Record<string, unknown>>().notNull(),
  reviewedById: uuid().references(() => staffUsers.id),
  reviewedAt: timestamp({ withTimezone: true }),
  ...timestamps,
});

export const rerunQueue = pgTable("rerun_queue", {
  id: id(),
  kitId: uuid()
    .notNull()
    .references(() => kits.id, { onDelete: "cascade" }),
  target: text().notNull(),
  reason: text(),
  attempts: integer().notNull().default(1),
  status: rerunStatusEnum().notNull().default("active"),
  ...timestamps,
});

// ── Communications & audit ─────────────────────────────────────────────
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    kitId: uuid().references(() => kits.id, { onDelete: "set null" }),
    channel: notificationChannelEnum().notNull(),
    template: text().notNull(),
    status: notificationStatusEnum().notNull().default("queued"),
    providerMessageId: text(),
    error: text(),
    sentAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("notifications_status_idx").on(t.status), index("notifications_customer_idx").on(t.customerId)],
);

/** Append-only audit log. Never update or delete rows. */
export const events = pgTable(
  "events",
  {
    id: id(),
    entityType: text().notNull(),
    entityId: uuid().notNull(),
    type: text().notNull(),
    actorType: actorTypeEnum().notNull(),
    actorId: text(),
    actorLabel: text(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_entity_idx").on(t.entityType, t.entityId, t.occurredAt)],
);

// ── Relations (for the relational query API) ──────────────────────────
export const customersRelations = relations(customers, ({ many }) => ({
  pets: many(pets),
  orders: many(orders),
  kits: many(kits),
  addresses: many(addresses),
}));
export const petsRelations = relations(pets, ({ one, many }) => ({
  customer: one(customers, { fields: [pets.customerId], references: [customers.id] }),
  kits: many(kits),
}));
export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  items: many(orderItems),
  kits: many(kits),
  shippingAddress: one(addresses, { fields: [orders.shippingAddressId], references: [addresses.id] }),
}));
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));
export const kitsRelations = relations(kits, ({ one, many }) => ({
  order: one(orders, { fields: [kits.orderId], references: [orders.id] }),
  customer: one(customers, { fields: [kits.customerId], references: [customers.id] }),
  pet: one(pets, { fields: [kits.petId], references: [pets.id] }),
  shipments: many(shipments),
  labResults: many(labResults),
}));
export const shipmentsRelations = relations(shipments, ({ one }) => ({
  kit: one(kits, { fields: [shipments.kitId], references: [kits.id] }),
}));
export const labResultsRelations = relations(labResults, ({ one }) => ({
  kit: one(kits, { fields: [labResults.kitId], references: [kits.id] }),
}));
export const addressesRelations = relations(addresses, ({ one }) => ({
  customer: one(customers, { fields: [addresses.customerId], references: [customers.id] }),
}));
export const staffUsersRelations = relations(staffUsers, ({ one }) => ({
  roleRef: one(roles, { fields: [staffUsers.role], references: [roles.key] }),
}));
