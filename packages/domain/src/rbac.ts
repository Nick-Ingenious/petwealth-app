/**
 * Role-based access control for staff.
 *
 * Permissions are defined here, in code, so every check is type-safe. Which
 * roles hold which permissions is data (the `role_permissions` table) and is
 * edited on the admin Permissions page. `super_admin` implicitly holds every
 * permission and cannot be edited or removed.
 */

export const PERMISSIONS = {
  "dashboard.view": { module: "Dashboard", label: "View dashboard", kind: "page" },
  "orders.view": { module: "Orders", label: "View orders", kind: "page" },
  "orders.manage": { module: "Orders", label: "Edit / cancel orders", kind: "action" },
  "kits.view": { module: "Tests", label: "View tests & kits", kind: "page" },
  "kits.manage": { module: "Tests", label: "Change kit status", kind: "action" },
  "kits.receive": { module: "Receive Kits", label: "Receive kits at lab", kind: "action" },
  "customers.view": { module: "Customers", label: "View customers", kind: "page" },
  "customers.manage": { module: "Customers", label: "Edit customers", kind: "action" },
  "pets.view": { module: "Pets", label: "View pets", kind: "page" },
  "pets.manage": { module: "Pets", label: "Edit pets", kind: "action" },
  "lab_results.view": { module: "Lab Results", label: "View lab results", kind: "page" },
  "lab_results.upload": { module: "Lab Results", label: "Upload lab files", kind: "action" },
  "lab_results.release": { module: "Lab Results", label: "Release results to customers", kind: "action" },
  "reruns.manage": { module: "Rerun Queue", label: "Manage rerun queue", kind: "action" },
  "tracking.manage": { module: "Kit Tracking", label: "Associate tracking numbers", kind: "action" },
  "wholesale.manage": { module: "Wholesale", label: "Manage wholesale accounts", kind: "action" },
  "staff.view": { module: "User Management", label: "View staff users", kind: "page" },
  "staff.manage": { module: "User Management", label: "Invite / disable staff", kind: "action" },
  "permissions.manage": { module: "Permissions", label: "Edit role permissions", kind: "action" },
  "api.access": { module: "API", label: "Use the API docs & MCP", kind: "page" },
} as const satisfies Record<string, { module: string; label: string; kind: "page" | "action" }>;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_KEYS = ["super_admin", "manager", "ops", "customer_support", "lab_tech"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABEL: Record<RoleKey, string> = {
  super_admin: "Super Admin",
  manager: "Manager",
  ops: "Ops",
  customer_support: "Customer Support",
  lab_tech: "Lab Tech",
};

/** Starting permissions for each editable role (seeded into `role_permissions`). */
export const DEFAULT_ROLE_PERMISSIONS: Record<Exclude<RoleKey, "super_admin">, Permission[]> = {
  manager: ALL_PERMISSIONS.filter((p) => p !== "permissions.manage"),
  ops: [
    "orders.view",
    "orders.manage",
    "kits.view",
    "kits.manage",
    "kits.receive",
    "customers.view",
    "pets.view",
    "tracking.manage",
    "reruns.manage",
  ],
  customer_support: [
    "dashboard.view",
    "orders.view",
    "kits.view",
    "customers.view",
    "customers.manage",
    "pets.view",
    "pets.manage",
    "lab_results.view",
  ],
  lab_tech: [
    "kits.view",
    "kits.receive",
    "lab_results.view",
    "lab_results.upload",
    "reruns.manage",
  ],
};

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}

/**
 * The one permission check used everywhere.
 * @param granted permissions loaded from `role_permissions` for the user's role
 */
export function hasPermission(
  role: RoleKey,
  granted: ReadonlySet<Permission> | readonly Permission[],
  permission: Permission,
): boolean {
  if (role === "super_admin") return true;
  return granted instanceof Set ? granted.has(permission) : (granted as readonly Permission[]).includes(permission);
}

/** Is this email allowed to sign in to the staff portal? */
export function isAllowedStaffEmail(email: string, allowedDomains: readonly string[]): boolean {
  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return allowedDomains.some((d) => d.trim().toLowerCase() === domain);
}
