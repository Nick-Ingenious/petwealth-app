import { describe, expect, it } from "vitest";
import { customerUpdateSchema, kitCodeSchema, listQuerySchema, rolePermissionsSchema } from "./validators";

describe("validators", () => {
  it("normalises kit codes", () => {
    expect(kitCodeSchema.parse(" ffec 002 946")).toBe("FFEC-002-946");
    expect(kitCodeSchema.safeParse("nope").success).toBe(false);
  });

  it("falls back to safe list defaults on junk query params", () => {
    expect(listQuerySchema.parse({ page: "-3", pageSize: "9999" })).toEqual({ page: 1, pageSize: 25 });
    expect(listQuerySchema.parse({ page: "2", pageSize: "50", q: " max " })).toEqual({
      page: 2,
      pageSize: 50,
      q: "max",
    });
  });

  it("validates customer updates", () => {
    const ok = customerUpdateSchema.parse({
      firstName: " Jo ",
      lastName: "Doe",
      email: "JO@EXAMPLE.COM",
      phone: "(415) 555-0100",
      smsOptIn: true,
    });
    expect(ok).toMatchObject({ firstName: "Jo", email: "jo@example.com", phone: "4155550100" });
    expect(customerUpdateSchema.safeParse({ firstName: "", lastName: "x", email: "bad", phone: "", smsOptIn: false }).success).toBe(false);
  });

  it("does not allow editing super admin permissions", () => {
    expect(rolePermissionsSchema.safeParse({ role: "super_admin", permissions: [] }).success).toBe(false);
    expect(rolePermissionsSchema.safeParse({ role: "ops", permissions: ["orders.view"] }).success).toBe(true);
    expect(rolePermissionsSchema.safeParse({ role: "ops", permissions: ["root"] }).success).toBe(false);
  });
});
