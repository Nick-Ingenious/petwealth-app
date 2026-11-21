import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  hasPermission,
  isAllowedStaffEmail,
  isPermission,
} from "./rbac";

describe("rbac", () => {
  it("super admin holds every permission regardless of grants", () => {
    for (const p of ALL_PERMISSIONS) expect(hasPermission("super_admin", [], p)).toBe(true);
  });

  it("other roles hold only what is granted", () => {
    expect(hasPermission("lab_tech", DEFAULT_ROLE_PERMISSIONS.lab_tech, "kits.receive")).toBe(true);
    expect(hasPermission("lab_tech", DEFAULT_ROLE_PERMISSIONS.lab_tech, "customers.view")).toBe(false);
    expect(hasPermission("ops", new Set(DEFAULT_ROLE_PERMISSIONS.ops), "orders.view")).toBe(true);
  });

  it("no default role can edit permissions", () => {
    for (const perms of Object.values(DEFAULT_ROLE_PERMISSIONS)) {
      expect(perms).not.toContain("permissions.manage");
    }
  });

  it("default grants only reference real permissions", () => {
    for (const perms of Object.values(DEFAULT_ROLE_PERMISSIONS)) {
      for (const p of perms) expect(isPermission(p)).toBe(true);
    }
    expect(isPermission("hasOwnProperty")).toBe(false);
  });

  it("restricts staff sign-in to allowed domains", () => {
    expect(isAllowedStaffEmail("angelo@petwealth.com", ["petwealth.com"])).toBe(true);
    expect(isAllowedStaffEmail("ANGELO@PetWealth.com", ["petwealth.com"])).toBe(true);
    expect(isAllowedStaffEmail("x@petwealth.com.evil.io", ["petwealth.com"])).toBe(false);
    expect(isAllowedStaffEmail("x@gmail.com", ["petwealth.com"])).toBe(false);
    expect(isAllowedStaffEmail("@petwealth.com", ["petwealth.com"])).toBe(false);
  });
});
