import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Shared Drizzle client.
 *
 * Uses postgres.js over TCP, which works against both local Docker Postgres and
 * Neon's pooled connection string. On Vercel Fluid Compute the instance (and
 * this pool) is reused across concurrent requests, so keep `max` small.
 */
function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env (see README).");
  const client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    prepare: !url.includes("-pooler."), // Neon's PgBouncer pooler doesn't support prepared statements
    connect_timeout: 10,
    onnotice: () => {}, // silence "already exists, skipping" notices from idempotent DDL
  });
  return drizzle(client, { schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof createDb>;
/** A transaction handle, accepted anywhere a `Db` is. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

const globalForDb = globalThis as unknown as { __petwealthDb?: Db };

/** Lazily created singleton (survives Next.js dev hot reloads). */
export function getDb(): Db {
  globalForDb.__petwealthDb ??= createDb();
  return globalForDb.__petwealthDb;
}
