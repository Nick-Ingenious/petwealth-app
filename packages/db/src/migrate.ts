/** Applies pending SQL migrations from ./migrations. Run with `pnpm db:migrate`. */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { getDb } from "./client";

// Neon: run DDL over the direct connection, not the PgBouncer pooler.
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;

/**
 * Both Vercel projects (admin + portal) migrate during their builds, so a merge
 * to main runs two migrations against production at once. A Postgres advisory
 * lock, held on a dedicated connection, makes the second wait for the first and
 * then find nothing left to apply.
 */
const MIGRATION_LOCK_ID = 7_243_181_001;

const db = getDb();
const lock = await db.$client.reserve();
await lock`select pg_advisory_lock(${MIGRATION_LOCK_ID})`;
try {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
  console.log("✔ migrations applied");
} finally {
  await lock`select pg_advisory_unlock(${MIGRATION_LOCK_ID})`;
  lock.release();
  await db.$client.end();
}
