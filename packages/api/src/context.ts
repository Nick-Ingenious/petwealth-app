import { hasPermission, type Permission, type RoleKey } from "@petwealth/domain";
import { forbidden } from "./errors";

/**
 * Who is performing an operation. Built once per request by the app's auth
 * layer (Clerk session, API token, or MCP OAuth) and passed to every service.
 */
export interface StaffContext {
  kind: "staff";
  staffId: string;
  email: string;
  name: string | null;
  role: RoleKey;
  permissions: ReadonlySet<Permission>;
  /** Where the call came from, recorded in the audit log. */
  via: "admin_ui" | "api" | "mcp";
}

export function can(ctx: StaffContext, permission: Permission): boolean {
  return hasPermission(ctx.role, ctx.permissions, permission);
}

/** Throws a 403 AppError unless the actor holds `permission`. Call first in every service. */
export function requirePermission(ctx: StaffContext, permission: Permission): void {
  if (!can(ctx, permission)) throw forbidden(permission);
}

export function actorFields(ctx: StaffContext) {
  return { actorType: "staff" as const, actorId: ctx.staffId, actorLabel: ctx.email };
}

/**
 * A signed-in customer (portal / mobile app). Built from the customer Clerk
 * session; every portal service scopes its queries to `customerId`.
 */
export interface CustomerContext {
  kind: "customer";
  customerId: string;
  email: string;
  needsOnboarding: boolean;
}

export function customerActor(ctx: CustomerContext) {
  return { actorType: "customer" as const, actorId: ctx.customerId, actorLabel: ctx.email };
}
