import type { Permission } from "@petwealth/domain";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission: Permission;
  /** Not built yet — shown disabled with a "Soon" tag. */
  soon?: boolean;
}

export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Operations",
    items: [
      { href: "/", label: "Dashboard", icon: "dashboard", permission: "dashboard.view" },
      { href: "/orders", label: "Orders", icon: "orders", permission: "orders.view" },
      { href: "/kits", label: "Tests", icon: "kits", permission: "kits.view" },
      { href: "/customers", label: "Customers", icon: "customers", permission: "customers.view" },
      { href: "/pets", label: "Pets", icon: "pets", permission: "pets.view" },
    ],
  },
  {
    section: "Lab",
    items: [
      { href: "/receive", label: "Receive Kits", icon: "receive", permission: "kits.receive" },
      { href: "/lab-results", label: "Lab Results", icon: "results", permission: "lab_results.view" },
      { href: "/reruns", label: "Rerun Queue", icon: "rerun", permission: "reruns.manage", soon: true },
      { href: "/tracking", label: "Kit Tracking", icon: "tracking", permission: "tracking.manage", soon: true },
    ],
  },
  {
    section: "Admin",
    items: [
      { href: "/wholesale", label: "Wholesale", icon: "wholesale", permission: "wholesale.manage", soon: true },
      { href: "/users", label: "User Management", icon: "users", permission: "staff.view" },
      { href: "/permissions", label: "Permissions", icon: "permissions", permission: "permissions.manage" },
      { href: "/api/docs", label: "API Docs", icon: "api", permission: "api.access" },
    ],
  },
];
