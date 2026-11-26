/**
 * Staff assistant (MCP) tools against a real database.
 *   RUN_DB_TESTS=1 pnpm --filter @petwealth/api test
 */
import { randomInt } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, type Permission } from "@petwealth/domain";
import { getDb, schema as s } from "@petwealth/db";
import type { StaffContext } from "./context";
import { freshKitCode } from "./test-kit-codes";
import { STAFF_TOOLS, assertAssistantAccess } from "./mcp/tools";

const run = process.env.RUN_DB_TESTS === "1";
const env = { adminUrl: "https://admin.example.test" };
const call = (ctx: StaffContext, name: string, args: unknown) => {
  const t = STAFF_TOOLS.find((x) => x.name === name)!;
  return t.run(ctx, t.inputSchema.parse(args), env) as Promise<any>;
};

async function staff(permissions: readonly Permission[], role: StaffContext["role"] = "super_admin"): Promise<StaffContext> {
  const [row] = await getDb().insert(s.staffUsers).values({ email: `mcp.${randomInt(1e9)}@petwealth.com`, role: "super_admin", status: "active" }).returning();
  return { kind: "staff", staffId: row!.id, email: row!.email, name: null, role, permissions: new Set(permissions), via: "mcp" };
}

describe.skipIf(!run)("staff assistant tools (db)", () => {
  afterAll(async () => {
    await getDb().$client.end();
  });

  it("every tool has a name, description and object schema", () => {
    const names = STAFF_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of STAFF_TOOLS) expect(t.description.length).toBeGreaterThan(20);
    expect(STAFF_TOOLS.filter((t) => !t.readOnly).map((t) => t.name)).toEqual(["upload_lab_results"]);
  });

  it("looks things up and ingests lab results with the caller's permissions", async () => {
    const ctx = await staff(ALL_PERMISSIONS);
    const db = getDb();
    const [customer] = await db.insert(s.customers).values({ email: `mcp.${randomInt(1e9)}@example.com`, firstName: "Mia", lastName: "Chen" }).returning();
    const [pet] = await db.insert(s.pets).values({ customerId: customer!.id, name: "Pepper", species: "cat" }).returning();
    const code = await freshKitCode("cat", "fecal");
    await db.insert(s.kits).values({ code, customerId: customer!.id, petId: pet!.id, species: "cat", panel: "fecal", status: "received_at_lab" });

    expect(await call(ctx, "whoami", {})).toMatchObject({ email: ctx.email, role: "super_admin" });
    expect((await call(ctx, "search_kits", { query: code })).items.map((k: { code: string }) => k.code)).toEqual([code]);
    expect(await call(ctx, "get_kit", { code: code.toLowerCase() })).toMatchObject({ code, status: "received_at_lab" });

    const csv = [
      "Well,Omit,Target,Sample,Cq,Amp Status",
      `A1,FALSE,Giardia spp._FGI,${code},27.1,Amp`,
      `A1,FALSE,Salmonella spp._FGI,${code},Undetermined,No Amp`,
      `A1,FALSE,FGI Extraction Control_FGI,${code},21.0,Amp`,
      "A2,FALSE,Giardia spp._FGI,Fffec-001-001,30,Amp",
    ].join("\n");
    const out = await call(ctx, "upload_lab_results", { filename: "WellResult-mcp.csv", csv });
    expect(out.uploaded).toMatchObject({ matched: 1, unmatched: 1 });
    expect(out.link).toBe(`${env.adminUrl}/lab-results/${out.id}`);
    expect(out.kits[0]).toMatchObject({ kitCode: code, kitStatus: "processing", result: "pending", pet: "Pepper", summary: "none" });
    expect(out.kits[0].detected).toEqual([{ name: "Giardia spp.", cq: 27.1 }]);
    expect(out.unmatched[0]).toMatchObject({ sample: "Fffec-001-001", suggestedCode: "FFEC-001-001" });

    const runs = await call(ctx, "list_lab_runs", { limit: 100 });
    expect(runs.find((r: { id: string }) => r.id === out.id)).toMatchObject({ pending: 1, link: out.link });
    expect(await call(ctx, "get_lab_run", { id: out.id })).toMatchObject({ id: out.id, rows: 4 });
  });

  it("respects permissions", async () => {
    const viewer = await staff(["kits.view", "api.access"], "customer_support");
    expect(() => assertAssistantAccess(viewer)).not.toThrow();
    await expect(
      call(viewer, "upload_lab_results", { filename: "x.csv", csv: "Well,Target,Sample,Cq,Amp Status\nA1,Giardia spp._FGI,FFEC-001-001,20,Amp" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(call(viewer, "search_customers", {})).rejects.toMatchObject({ status: 403 });
    const noApi = await staff(["kits.view"], "customer_support");
    expect(() => assertAssistantAccess(noApi)).toThrow();
  });
});
