/** Applies pending SQL migrations from ./migrations. Run with `pnpm db:migrate`. */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { getDb } from "./client";

// Neon: run DDL over the direct connection, not the PgBouncer pooler.
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;

const db = getDb();
await migrate(db, { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
console.log("✔ migrations applied");
await db.$client.end();
