/**
 * Production-safe bootstrap: makes sure a fresh database has the staff roles,
 * their default permissions, and one Super Admin to sign in with.
 *
 *   BOOTSTRAP_SUPER_ADMIN_EMAIL=you@petwealth.com pnpm --filter @petwealth/db bootstrap
 *
 * Idempotent and non-destructive (unlike `seed`):
 * - roles are inserted only if missing;
 * - default permissions are granted only to roles that have none yet, so
 *   edits made on the Permissions page are never overwritten;
 * - the Super Admin is created only if no Super Admin exists.
 */
import { eq, sql } from "drizzle-orm";
import { DEFAULT_ROLE_PERMISSIONS, ROLE_KEYS, ROLE_LABEL } from "@petwealth/domain";
import { getDb } from "./client";
import * as s from "./schema";

if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;

const db = getDb();

await db
  .insert(s.roles)
  .values(ROLE_KEYS.map((key) => ({ key, name: ROLE_LABEL[key] })))
  .onConflictDoNothing();

for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
  const key = role as keyof typeof DEFAULT_ROLE_PERMISSIONS;
  const existing = await db.$count(s.rolePermissions, eq(s.rolePermissions.role, key));
  if (existing === 0) {
    await db.insert(s.rolePermissions).values(permissions.map((permission) => ({ role: key, permission })));
    console.log(`  granted default permissions to ${key}`);
  }
}

const email = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const admins = await db.$count(s.staffUsers, eq(s.staffUsers.role, "super_admin"));
if (admins > 0) {
  console.log("✔ roles ready; a Super Admin already exists");
} else if (!email) {
  console.warn("⚠ no Super Admin exists — set BOOTSTRAP_SUPER_ADMIN_EMAIL to create one");
} else {
  const existing = await db.query.staffUsers.findFirst({ where: sql`lower(${s.staffUsers.email}) = ${email}` });
  if (existing) {
    await db.update(s.staffUsers).set({ role: "super_admin", status: "active" }).where(eq(s.staffUsers.id, existing.id));
  } else {
    await db.insert(s.staffUsers).values({ email, role: "super_admin", status: "invited" });
  }
  console.log(`✔ roles ready; Super Admin invited: ${email}`);
}

await db.$client.end();
