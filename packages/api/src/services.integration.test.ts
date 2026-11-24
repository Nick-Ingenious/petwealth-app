/**
 * Integration tests against a real (seeded) Postgres. They mutate data, so
 * they only run when RUN_DB_TESTS=1:
 *
 *   pnpm db:seed && RUN_DB_TESTS=1 pnpm --filter @petwealth/api test
 */
import { afterAll, describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, KIT_STATUSES } from "@petwealth/domain";
import { and, eq, getDb, inArray, isNotNull, schema as s } from "@petwealth/db";
import type { StaffContext } from "./context";
import { AppError } from "./errors";
import { getDashboard, getKit, listKits, listOrders, receiveKit } from "./index";

const run = process.env.RUN_DB_TESTS === "1";

const superAdmin: StaffContext = {
  kind: "staff",
  staffId: "00000000-0000-0000-0000-000000000000",
  email: "test@petwealth.com",
  name: "Test",
  role: "super_admin",
  permissions: new Set(ALL_PERMISSIONS),
  via: "api",
};
const labTech: StaffContext = { ...superAdmin, role: "lab_tech", permissions: new Set(DEFAULT_ROLE_PERMISSIONS.lab_tech) };

describe.skipIf(!run)("services (db)", () => {
  afterAll(async () => {
    await getDb().$client.end();
  });

  it("dashboard pipeline counts match the kit list totals", async () => {
    const dash = await getDashboard(superAdmin, { days: 30 });
    for (const status of KIT_STATUSES) {
      const page = await listKits(superAdmin, { status, pageSize: 10 });
      expect(page.total, status).toBe(dash.pipeline[status]);
    }
  });

  it("orders filtered by kit status only contain matching kits", async () => {
    const page = await listOrders(superAdmin, { status: "in_transit", pageSize: 100 });
    for (const order of page.items) expect(order.kits.some((k) => k.status === "in_transit")).toBe(true);
  });

  it("receives a kit, audits it, and queues the email", async () => {
    // Any kit the lab can receive (earlier runs may have used up the in-transit ones).
    const [kit] = await getDb()
      .select()
      .from(s.kits)
      .where(and(inArray(s.kits.status, ["in_transit", "sample_collected", "assigned", "activated", "delivered", "shipped"]), isNotNull(s.kits.code)))
      .limit(1);
    expect(kit?.code, "no receivable kit left — run pnpm db:seed").toBeTruthy();
    const from = kit!.status;
    const res = await receiveKit(labTech, { kitCode: kit!.code!.toLowerCase() });
    expect(res.kit.status).toBe("received_at_lab");

    const detail = await getKit(superAdmin, kit!.code!);
    expect(detail.timeline[0]).toMatchObject({ type: "kit.status_changed", payload: { from, to: "received_at_lab" } });
    const notes = await getDb().select().from(s.notifications).where(eq(s.notifications.kitId, kit!.id));
    expect(notes.some((n) => n.template === "kit_received" && n.channel === "email" && n.status === "queued")).toBe(true);

    await expect(receiveKit(labTech, { kitCode: kit!.code! })).rejects.toMatchObject({ status: 409 });
  });

  it("returns a clear 404 for unknown kits", async () => {
    await expect(receiveKit(labTech, { kitCode: "FFEC-999-999" })).rejects.toMatchObject({ status: 404 });
  });

  it("denies roles without the permission", async () => {
    await expect(listOrders(labTech, {})).rejects.toBeInstanceOf(AppError);
    await expect(listOrders(labTech, {})).rejects.toMatchObject({ status: 403 });
  });
});
