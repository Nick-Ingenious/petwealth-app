# Architecture

## Request flow

```
Browser ──► proxy.ts (Clerk session required) ──► page / server action / route handler
                                                    │  requireStaff(permission)   ← who + may they see this page?
                                                    ▼
                                       packages/api services  ← requirePermission() again, zod-parse input
                                                    │            transaction, audit event, notification queue
                                                    ▼
                                       packages/db (Drizzle) ──► Postgres (Neon on Vercel)
```

The admin UI, the REST API (`/api/v1`) and — in Milestone 3 — the MCP server all call the **same service functions**. Permission checks, validation and audit logging live in the services, so no entry point (including an AI agent) can skip them.

## Key decisions

- **One kit lifecycle** (`packages/domain/src/kit-lifecycle.ts`). Every status change goes through `changeKitStatus()` in `packages/api/src/services/kits.ts`, which validates the transition, stamps milestone timestamps, writes an `events` row and queues the SMS — in one transaction with an optimistic guard. The dashboard pipeline is a `GROUP BY kits.status`, so dashboard and list counts always agree (an integration test enforces this).
- **Audit log** — `events` is append-only: who (staff/customer/integration), what, when, and the from→to payload. Customer edits record *which fields* changed, not values, to keep PII out of logs.
- **RBAC** — permissions are defined in code (type-safe); role→permission grants are data, edited on the Permissions page. Super Admin is implicit. Guardrails: you can't edit your own role, only Super Admins manage Super Admins, and there must always be one active Super Admin.
- **Two identity systems** — staff use Clerk instance A (Google only, `petwealth.com` domain, must be invited). Customers will use a *separate* Clerk instance B (email + password), so a customer session can never authenticate to admin.
- **Money** is integer cents; **timestamps** are `timestamptz`; human IDs (`PW-10086`, `CUS-1042`, `PET-1100`, kit codes) are separate from UUID primary keys.
- **Legacy migration** — `legacy_id` columns keep the old AWS primary keys so the import is idempotent and traceable.

## Security baseline (in place)

- Proxy requires a session on every non-public route; every page and service re-checks staff status and permission.
- Staff sign-in requires a verified email on an allowed domain *and* an invited, non-disabled `staff_users` row.
- All input is zod-validated; SQL is parameterised (Drizzle); LIKE wildcards in search are escaped.
- REST writes must be same-origin JSON (blocks CSRF); errors return `{ error: { code, message } }` with no stack traces.
- Security headers: HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer, permissions policy, `noindex`.
- Seed refuses to run against production; the dev auth bypass is impossible to enable on Vercel.

## Kit lifecycle

`ordered → label_created → shipped → delivered → activated → assigned → sample_collected → in_transit → received_at_lab → processing → completed`, plus `rerun` and `cancelled`. The lab may receive a kit from any post-shipment state (customers often skip steps). Notifications: `shipped` → kit shipped, `received_at_lab` → kit received, `completed` → results ready.
