# ADR 001 — Platform stack

**Status:** accepted · 2026-11-21

**Decision:** Turborepo + pnpm monorepo; Next.js 16 (App Router) on Vercel Fluid Compute; Neon Postgres via the Vercel Marketplace with Drizzle ORM; Clerk with separate staff (Google) and customer (email/password) instances; zod for every input; OpenAPI generated from the same zod schemas; Tailwind v4 design system.

**Why:** one language end-to-end and shared packages for the coming React Native app; serverless Postgres with per-preview branches; managed auth with native mobile SDKs instead of hand-rolled password storage; a single validation source so API docs can't drift from runtime behaviour.

**Consequences:** services must stay framework-agnostic (no Next imports in `packages/*`) so the MCP server and mobile backend can reuse them. Prepared statements are disabled automatically on Neon's pooled (`-pooler`) host.
