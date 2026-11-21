/**
 * OpenAPI 3.1 contract for the PetWealth staff API (/api/v1).
 *
 * Request schemas are the SAME zod schemas the services parse with (from
 * @petwealth/domain), so the docs cannot drift from runtime validation.
 * Served at /api/openapi.json and rendered at /api/docs.
 */
import { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  KIT_STATUSES,
  PANELS,
  SPECIES,
  customerUpdateSchema,
  kitListQuerySchema,
  listQuerySchema,
  petListQuerySchema,
  petUpdateSchema,
} from "@petwealth/domain";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();
registry.registerComponent("securitySchemes", "session", {
  type: "apiKey",
  in: "cookie",
  name: "__session",
  description: "Clerk staff session cookie (sign in at /sign-in). Token auth for integrations and MCP arrives in Milestone 3.",
});

// ── Shared schemas ─────────────────────────────────────────────────────
const Uuid = z.uuid();
const KitCode = z.string().regex(/^[CF](FEC|RES|ORA)-\d{3}-\d{3}$/).openapi({ example: "FFEC-002-946" });
const KitStatus = registry.register("KitStatus", z.enum(KIT_STATUSES));
const ErrorBody = registry.register(
  "Error",
  z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }),
);
const page = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.object({ items: z.array(item), total: z.number().int(), page: z.number().int(), pageSize: z.number().int(), pageCount: z.number().int() }) });
const one = <T extends z.ZodType>(item: T) => z.object({ data: item });

const CustomerRef = z.object({ id: Uuid, email: z.email(), firstName: z.string().nullable(), lastName: z.string().nullable() });
const KitSummary = registry.register(
  "KitSummary",
  z.object({
    id: Uuid,
    code: KitCode.nullable(),
    species: z.enum(SPECIES),
    panel: z.enum(PANELS),
    status: KitStatus,
    statusChangedAt: z.iso.datetime(),
    customer: CustomerRef.nullable(),
    pet: z.object({ id: Uuid, name: z.string(), species: z.enum(SPECIES) }).nullable(),
  }),
);
const OrderSummary = registry.register(
  "OrderSummary",
  z.object({
    id: Uuid,
    number: z.number().int(),
    shopifyOrderName: z.string().nullable(),
    status: z.enum(["open", "fulfilled", "cancelled", "refunded"]),
    totalCents: z.number().int(),
    placedAt: z.iso.datetime(),
    customer: CustomerRef,
    products: z.array(z.string()),
    kits: z.array(z.object({ code: KitCode.nullable(), status: KitStatus, petName: z.string().nullable() })),
  }),
);
const Customer = registry.register(
  "Customer",
  CustomerRef.extend({ number: z.number().int(), phone: z.string().nullable(), smsOptIn: z.boolean(), status: z.enum(["active", "disabled"]), createdAt: z.iso.datetime() }),
);
const Pet = registry.register(
  "Pet",
  z.object({ id: Uuid, number: z.number().int(), name: z.string(), species: z.enum(SPECIES), breed: z.string().nullable(), dateOfBirth: z.iso.date().nullable() }),
);

const errors = {
  401: { description: "Not signed in", content: { "application/json": { schema: ErrorBody } } },
  403: { description: "Missing permission", content: { "application/json": { schema: ErrorBody } } },
};
const json = (schema: z.ZodType, description = "OK") => ({ description, content: { "application/json": { schema } } });
const security = [{ session: [] }];

// ── Paths ──────────────────────────────────────────────────────────────
registry.registerPath({
  method: "get", path: "/api/v1/dashboard", tags: ["Dashboard"], security,
  summary: "KPIs, kit pipeline and revenue series", description: "Requires `dashboard.view`.",
  request: { query: z.object({ days: z.enum(["7", "30", "90", "365"]).optional() }) },
  responses: { 200: json(one(z.record(z.string(), z.unknown()))), ...errors },
});
registry.registerPath({
  method: "get", path: "/api/v1/orders", tags: ["Orders"], security,
  summary: "List orders", description: "`status` returns orders with at least one kit in that status. Requires `orders.view`.",
  request: { query: kitListQuerySchema },
  responses: { 200: json(page(OrderSummary)), ...errors },
});
registry.registerPath({
  method: "get", path: "/api/v1/orders/{id}", tags: ["Orders"], security, summary: "Get an order with kits, items and timeline",
  request: { params: z.object({ id: Uuid }) },
  responses: { 200: json(one(z.record(z.string(), z.unknown()))), 404: json(ErrorBody, "Not found"), ...errors },
});
registry.registerPath({
  method: "get", path: "/api/v1/kits", tags: ["Kits"], security, summary: "List kits (tests)", description: "Requires `kits.view`.",
  request: { query: kitListQuerySchema }, responses: { 200: json(page(KitSummary)), ...errors },
});
registry.registerPath({
  method: "get", path: "/api/v1/kits/{code}", tags: ["Kits"], security, summary: "Get a kit with shipments, results and audit timeline",
  request: { params: z.object({ code: KitCode }) },
  responses: { 200: json(one(z.record(z.string(), z.unknown()))), 404: json(ErrorBody, "Not found"), ...errors },
});
registry.registerPath({
  method: "post", path: "/api/v1/kits/{code}/receive", tags: ["Kits"], security,
  summary: "Check a kit in at the lab", description: "Moves the kit to `received_at_lab`, audits it, and queues the customer SMS. Requires `kits.receive`.",
  request: { params: z.object({ code: KitCode }) },
  responses: {
    200: json(one(z.object({ kit: KitSummary.partial(), warnings: z.array(z.string()) }))),
    404: json(ErrorBody, "Unknown kit"), 409: json(ErrorBody, "Already received / invalid transition"), ...errors,
  },
});
registry.registerPath({
  method: "post", path: "/api/v1/kits/{code}/transition", tags: ["Kits"], security,
  summary: "Change a kit's status", description: "Only transitions allowed by the kit lifecycle succeed (409 otherwise). Requires `kits.manage`.",
  request: { params: z.object({ code: KitCode }), body: { content: { "application/json": { schema: z.object({ to: KitStatus, note: z.string().max(500).optional() }) } } } },
  responses: { 200: json(one(KitSummary.partial())), 409: json(ErrorBody, "Invalid transition"), ...errors },
});
registry.registerPath({
  method: "get", path: "/api/v1/customers", tags: ["Customers"], security, summary: "List customers",
  request: { query: listQuerySchema }, responses: { 200: json(page(Customer)), ...errors },
});
registry.registerPath({
  method: "get", path: "/api/v1/customers/{id}", tags: ["Customers"], security, summary: "Get a customer with pets, orders and messages",
  request: { params: z.object({ id: Uuid }) }, responses: { 200: json(one(Customer)), 404: json(ErrorBody, "Not found"), ...errors },
});
registry.registerPath({
  method: "patch", path: "/api/v1/customers/{id}", tags: ["Customers"], security, summary: "Update a customer", description: "Requires `customers.manage`.",
  request: { params: z.object({ id: Uuid }), body: { content: { "application/json": { schema: customerUpdateSchema } } } },
  responses: { 200: json(one(Customer)), 409: json(ErrorBody, "Email in use"), 422: json(ErrorBody, "Validation failed"), ...errors },
});
registry.registerPath({
  method: "get", path: "/api/v1/pets", tags: ["Pets"], security, summary: "List pets",
  request: { query: petListQuerySchema }, responses: { 200: json(page(Pet)), ...errors },
});
registry.registerPath({
  method: "get", path: "/api/v1/pets/{id}", tags: ["Pets"], security, summary: "Get a pet with its kits",
  request: { params: z.object({ id: Uuid }) }, responses: { 200: json(one(Pet)), 404: json(ErrorBody, "Not found"), ...errors },
});
registry.registerPath({
  method: "patch", path: "/api/v1/pets/{id}", tags: ["Pets"], security, summary: "Update a pet", description: "Requires `pets.manage`.",
  request: { params: z.object({ id: Uuid }), body: { content: { "application/json": { schema: petUpdateSchema } } } },
  responses: { 200: json(one(Pet)), 409: json(ErrorBody, "Species locked"), 422: json(ErrorBody, "Validation failed"), ...errors },
});

let cached: ReturnType<OpenApiGeneratorV31["generateDocument"]> | undefined;

export function getOpenApiDocument(serverUrl?: string) {
  cached ??= new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "PetWealth Staff API",
      version: "1.0.0",
      description:
        "Internal API for PetWealth staff tools and the AI/MCP assistant. All endpoints enforce the caller's role permissions and write to the audit log. Responses are `{ data }`; errors are `{ error: { code, message } }`.",
    },
    tags: ["Dashboard", "Orders", "Kits", "Customers", "Pets"].map((name) => ({ name })),
  });
  return serverUrl ? { ...cached, servers: [{ url: serverUrl }] } : cached;
}
