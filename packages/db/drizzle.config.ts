import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Local dev reads the monorepo-root .env; CI and Vercel inject env vars directly.
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  casing: "snake_case",
  strict: true,
});
