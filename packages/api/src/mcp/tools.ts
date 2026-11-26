/**
 * Tools for the staff AI assistant (MCP). Each one is a thin wrapper over an
 * existing service, called with the signed-in staff member's context, so the
 * assistant has exactly the same permissions as that person in the admin.
 *
 * Kept free of any MCP library so they can be tested directly; the admin app
 * registers them with its MCP route.
 */
import { KIT_STATUSES, SPECIES } from "@petwealth/domain";
import { z } from "zod";
import { requirePermission, type StaffContext } from "../context";
import { getCustomer, listCustomers } from "../services/customers";
import { getDashboard } from "../services/dashboard";
import { getKit, listKits } from "../services/kits";
import { getLabBatch, listLabBatches, uploadLabFile } from "../services/lab";
import { getOrder, listOrders } from "../services/orders";
import { getPet, listPets } from "../services/pets";

export interface StaffTool<S extends z.ZodType = z.ZodType> {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  /** True for tools that only read. The one write tool (lab upload) is false. */
  readOnly: boolean;
  run: (ctx: StaffContext, args: z.infer<S>, env: { adminUrl: string }) => Promise<unknown>;
}

const tool = <S extends z.ZodType>(t: StaffTool<S>) => t as unknown as StaffTool;

const page = z.number().int().min(1).optional().describe("Page number, starting at 1");
const query = z.string().max(200).optional().describe("Free-text search");

/** Lab run without every target row, so answers stay short; get_kit has the full detail. */
async function labRunSummary(ctx: StaffContext, id: string, adminUrl: string) {
  const b = await getLabBatch(ctx, id);
  return {
    id: b.id,
    run: b.number,
    filename: b.filename,
    status: b.status,
    rows: b.rowCount,
    uploadedAt: b.createdAt,
    uploadedBy: b.uploadedBy,
    link: `${adminUrl}/lab-results/${b.id}`,
    runControls: b.runControls,
    unmatched: b.unmatched.map((u) => ({ sample: u.sample, reason: u.reason, suggestedCode: u.suggestedCode, detected: u.detected })),
    kits: b.results.map((r) => ({
      kitCode: r.kitCode,
      kitStatus: r.kitStatus,
      pet: r.petName,
      customer: r.customerName,
      panel: r.panelCode,
      result: r.status,
      healthStatus: r.healthStatus,
      detected: r.targets.filter((t) => t.call === "detected").map((t) => ({ name: t.name, cq: t.cq })),
      reviewNotes: r.flags,
      summary: r.aiReport ? (r.aiReport.approved ? "approved" : "draft") : "none",
    })),
  };
}

export const STAFF_TOOLS: StaffTool[] = [
  tool({
    name: "whoami",
    title: "Who am I",
    description: "The signed-in staff member, their role and permissions.",
    inputSchema: z.object({}),
    readOnly: true,
    run: async (ctx) => ({ email: ctx.email, name: ctx.name, role: ctx.role, permissions: [...ctx.permissions].sort() }),
  }),
  tool({
    name: "get_pipeline",
    title: "Kit pipeline and dashboard",
    description: "Orders, revenue and how many kits are at each stage (ordered, shipped, at the lab, completed...). Same numbers as the admin dashboard.",
    inputSchema: z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]).optional().describe("Window for order and revenue figures, default 30") }),
    readOnly: true,
    run: (ctx, a) => getDashboard(ctx, { days: a.days ?? 30 }),
  }),
  tool({
    name: "search_customers",
    title: "Search customers",
    description: "Find customers by name, email or phone. Returns a page of matches.",
    inputSchema: z.object({ query, page }),
    readOnly: true,
    run: (ctx, a) => listCustomers(ctx, { q: a.query, page: a.page }),
  }),
  tool({
    name: "get_customer",
    title: "Customer details",
    description: "One customer with their pets, kits, orders and addresses. Use the id from search_customers.",
    inputSchema: z.object({ id: z.string().uuid() }),
    readOnly: true,
    run: (ctx, a) => getCustomer(ctx, a.id),
  }),
  tool({
    name: "search_pets",
    title: "Search pets",
    description: "Find pets by name or owner, optionally by species.",
    inputSchema: z.object({ query, species: z.enum(SPECIES).optional(), page }),
    readOnly: true,
    run: (ctx, a) => listPets(ctx, { q: a.query, species: a.species, page: a.page }),
  }),
  tool({
    name: "get_pet",
    title: "Pet details",
    description: "One pet with its owner and kits. Use the id from search_pets.",
    inputSchema: z.object({ id: z.string().uuid() }),
    readOnly: true,
    run: (ctx, a) => getPet(ctx, a.id),
  }),
  tool({
    name: "search_kits",
    title: "Search test kits",
    description: `Find kits by kit code, customer or pet, optionally by status (${KIT_STATUSES.join(", ")}).`,
    inputSchema: z.object({ query, status: z.enum(KIT_STATUSES).optional(), page }),
    readOnly: true,
    run: (ctx, a) => listKits(ctx, { q: a.query, status: a.status, page: a.page }),
  }),
  tool({
    name: "get_kit",
    title: "Kit details",
    description: "One kit by code (e.g. FFEC-002-703): status, customer, pet, shipments with tracking, lab results and the full status timeline.",
    inputSchema: z.object({ code: z.string().min(5).max(20) }),
    readOnly: true,
    run: (ctx, a) => getKit(ctx, a.code.trim().toUpperCase()),
  }),
  tool({
    name: "search_orders",
    title: "Search orders",
    description: "Find orders by order number, customer or kit code, optionally by the stage of their kits.",
    inputSchema: z.object({ query, status: z.enum(KIT_STATUSES).optional(), page }),
    readOnly: true,
    run: (ctx, a) => listOrders(ctx, { q: a.query, status: a.status, page: a.page }),
  }),
  tool({
    name: "get_order",
    title: "Order details",
    description: "One order with its items, kits, shipping and timeline. Use the id from search_orders.",
    inputSchema: z.object({ id: z.string().uuid() }),
    readOnly: true,
    run: (ctx, a) => getOrder(ctx, a.id),
  }),
  tool({
    name: "list_lab_runs",
    title: "Lab result uploads",
    description: "Recent lab result uploads (runs), newest first, with how many kits are waiting for review, released or held for rerun.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(100).optional() }),
    readOnly: true,
    run: async (ctx, a, env) => (await listLabBatches(ctx, a.limit ?? 20)).map((b) => ({ ...b, link: `${env.adminUrl}/lab-results/${b.id}` })),
  }),
  tool({
    name: "get_lab_run",
    title: "Lab run details",
    description: "One lab upload: run controls, unmatched samples and, per kit, what was detected, review notes and whether a summary is approved.",
    inputSchema: z.object({ id: z.string().uuid() }),
    readOnly: true,
    run: (ctx, a, env) => labRunSummary(ctx, a.id, env.adminUrl),
  }),
  tool({
    name: "upload_lab_results",
    title: "Upload lab results",
    description:
      "Ingest the lab's PCR export (the WellResult CSV, exactly as exported, controls included). Matches each Sample to its kit, calls each pathogen detected at Cq 34 or lower, flags anything to check, and moves received kits to Processing. Nothing is released to customers: staff review and release on the Lab Results page. Pass the full CSV text.",
    inputSchema: z.object({
      filename: z.string().min(1).max(255).describe("The file name, e.g. WellResult-2026-11-23.csv"),
      csv: z.string().min(1).describe("The complete CSV text, header row included"),
    }),
    readOnly: false,
    run: async (ctx, a, env) => {
      const up = await uploadLabFile(ctx, { filename: a.filename, csv: a.csv });
      return { uploaded: up, ...(await labRunSummary(ctx, up.id, env.adminUrl)) };
    },
  }),
];

/** Everyone using the assistant needs the "Use the API docs & MCP" permission. */
export function assertAssistantAccess(ctx: StaffContext) {
  requirePermission(ctx, "api.access");
}
