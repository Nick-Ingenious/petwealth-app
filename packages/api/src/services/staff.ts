import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLE_KEYS,
  isAllowedStaffEmail,
  isPermission,
  rolePermissionsSchema,
  staffInviteSchema,
  type Permission,
  type RoleKey,
} from "@petwealth/domain";
import { and, asc, eq, getDb, inArray, ne, schema as s, sql } from "@petwealth/db";
import { z } from "zod";
import { recordEvent } from "../audit";
import { actorFields, requirePermission, type StaffContext } from "../context";
import { AppError, conflict, invalid, notFound } from "../errors";

export async function permissionsForRole(role: RoleKey): Promise<Set<Permission>> {
  if (role === "super_admin") return new Set(ALL_PERMISSIONS);
  const rows = await getDb()
    .select({ permission: s.rolePermissions.permission })
    .from(s.rolePermissions)
    .where(eq(s.rolePermissions.role, role));
  return new Set(rows.map((r) => r.permission).filter(isPermission));
}

/**
 * Resolve a signed-in identity (from Clerk) to a staff context.
 *
 * Staff must be invited first: the first sign-in links the Clerk user to the
 * invited row by email. Returns `null` (→ access denied page) for unknown,
 * disabled, or out-of-domain users. This is the gate for the whole admin app.
 */
export async function resolveStaffContext(
  identity: { clerkUserId: string | null; email: string },
  opts: { allowedDomains: readonly string[]; via: StaffContext["via"] },
): Promise<StaffContext | null> {
  const email = identity.email.trim().toLowerCase();
  if (!isAllowedStaffEmail(email, opts.allowedDomains)) return null;
  const db = getDb();

  let staff = identity.clerkUserId
    ? await db.query.staffUsers.findFirst({ where: eq(s.staffUsers.clerkUserId, identity.clerkUserId) })
    : undefined;
  staff ??= await db.query.staffUsers.findFirst({ where: sql`lower(${s.staffUsers.email}) = ${email}` });
  if (!staff || staff.status === "disabled") return null;
  // A Clerk user may only claim an unlinked row, never take over someone else's.
  if (identity.clerkUserId && staff.clerkUserId && staff.clerkUserId !== identity.clerkUserId) return null;

  const stale = !staff.lastLoginAt || Date.now() - staff.lastLoginAt.getTime() > 15 * 60_000;
  if (staff.status === "invited" || (identity.clerkUserId && !staff.clerkUserId) || stale) {
    [staff] = await db
      .update(s.staffUsers)
      .set({ status: "active", clerkUserId: identity.clerkUserId ?? staff.clerkUserId, lastLoginAt: new Date() })
      .where(eq(s.staffUsers.id, staff.id))
      .returning();
  }
  return {
    kind: "staff",
    staffId: staff!.id,
    email: staff!.email,
    name: staff!.name,
    role: staff!.role,
    permissions: await permissionsForRole(staff!.role),
    via: opts.via,
  };
}

export async function listStaff(ctx: StaffContext) {
  requirePermission(ctx, "staff.view");
  return getDb().select().from(s.staffUsers).orderBy(asc(s.staffUsers.status), asc(s.staffUsers.email));
}

export async function inviteStaff(ctx: StaffContext, input: unknown, opts: { allowedDomains: readonly string[] }) {
  requirePermission(ctx, "staff.manage");
  const data = staffInviteSchema.parse(input);
  if (!isAllowedStaffEmail(data.email, opts.allowedDomains)) {
    throw invalid(`Staff must use a ${opts.allowedDomains.join(" / ")} email address.`);
  }
  if (data.role === "super_admin" && ctx.role !== "super_admin") {
    throw new AppError(403, "forbidden", "Only a Super Admin can invite another Super Admin.");
  }
  return getDb().transaction(async (tx) => {
    const existing = await tx.query.staffUsers.findFirst({ where: sql`lower(${s.staffUsers.email}) = ${data.email}` });
    if (existing) throw conflict(`${data.email} is already a staff user.`);
    const [row] = await tx
      .insert(s.staffUsers)
      .values({ email: data.email, name: data.name ?? null, role: data.role, status: "invited", invitedById: ctx.staffId })
      .returning();
    await recordEvent(tx, { entityType: "staff", entityId: row!.id, type: "staff.invited", ...actorFields(ctx), payload: { role: data.role } });
    return row!;
  });
}

const staffUpdateSchema = z.object({
  role: z.enum(ROLE_KEYS).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export async function updateStaff(ctx: StaffContext, id: string, input: unknown) {
  requirePermission(ctx, "staff.manage");
  const data = staffUpdateSchema.parse(input);
  if (id === ctx.staffId) throw invalid("You can't change your own role or status.");
  return getDb().transaction(async (tx) => {
    const target = await tx.query.staffUsers.findFirst({ where: eq(s.staffUsers.id, id) });
    if (!target) throw notFound("Staff user");
    const touchesSuperAdmin = target.role === "super_admin" || data.role === "super_admin";
    if (touchesSuperAdmin && ctx.role !== "super_admin") {
      throw new AppError(403, "forbidden", "Only a Super Admin can change Super Admin accounts.");
    }
    if (target.role === "super_admin" && (data.role && data.role !== "super_admin" || data.status === "disabled")) {
      const [{ n } = { n: 0 }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(s.staffUsers)
        .where(and(eq(s.staffUsers.role, "super_admin"), eq(s.staffUsers.status, "active"), ne(s.staffUsers.id, id)));
      if (n === 0) throw conflict("There must always be at least one active Super Admin.");
    }
    const [row] = await tx.update(s.staffUsers).set(data).where(eq(s.staffUsers.id, id)).returning();
    await recordEvent(tx, { entityType: "staff", entityId: id, type: "staff.updated", ...actorFields(ctx), payload: data });
    return row!;
  });
}

/** Role × permission matrix for the Permissions page. */
export async function getPermissionMatrix(ctx: StaffContext) {
  requirePermission(ctx, "permissions.manage");
  const rows = await getDb().select().from(s.rolePermissions);
  const editableRoles = ROLE_KEYS.filter((r) => r !== "super_admin");
  const granted = Object.fromEntries(
    editableRoles.map((r) => [r, rows.filter((x) => x.role === r).map((x) => x.permission).filter(isPermission)]),
  ) as Record<Exclude<RoleKey, "super_admin">, Permission[]>;
  return { permissions: PERMISSIONS, roles: editableRoles, granted };
}

export async function setRolePermissions(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "permissions.manage");
  const { role, permissions } = rolePermissionsSchema.parse(input);
  if (role === ctx.role) throw invalid("You can't edit the permissions of your own role.");
  const next = [...new Set(permissions)] as Permission[];
  return getDb().transaction(async (tx) => {
    const before = (await tx.select().from(s.rolePermissions).where(eq(s.rolePermissions.role, role))).map((r) => r.permission);
    const removed = before.filter((p) => !next.includes(p as Permission));
    const added = next.filter((p) => !before.includes(p));
    if (removed.length) {
      await tx.delete(s.rolePermissions).where(and(eq(s.rolePermissions.role, role), inArray(s.rolePermissions.permission, removed)));
    }
    if (added.length) await tx.insert(s.rolePermissions).values(added.map((permission) => ({ role, permission })));
    if (added.length || removed.length) {
      await tx.insert(s.events).values({ entityType: "role", entityId: ctx.staffId, type: "role.permissions_changed", ...actorFields(ctx), payload: { role, added, removed } });
    }
    return { role, added, removed };
  });
}
