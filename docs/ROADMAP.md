# Roadmap

## Milestone 1 — Foundation + admin core ✅ (this build)
Monorepo, schema + seed, kit lifecycle, RBAC, admin: Dashboard, Orders, Tests, Customers, Pets, Receive Kits, User Management, Permissions; REST API + OpenAPI docs.

## Milestone 2 — Fulfilment loop + customer portal
- ✅ Shopify `orders/paid` + `orders/cancelled` webhooks (HMAC-verified, idempotent) → customer, order + kits — see [SHOPIFY.md](SHOPIFY.md). Next: backfill recent orders via the Admin API once credentials exist.
- FedEx Ship API: outbound + return labels; tracking webhook/cron advances kits
- Twilio SMS worker for `notifications` rows (`queued` → `sent` → `delivered`), STOP handling. Start A2P 10DLC registration early — it takes weeks.
- Lab Upload (CSV/PDF via Vercel Blob) → review → release; Lab Results; Rerun Queue; Kit Tracking
- `apps/portal`: Clerk instance B, QR kit activation, pet registration, results view (mobile-first)

## Milestone 3 — AI
- AI report generation (AI SDK + Vercel AI Gateway, Claude) → `ai_reports`, staff review before release
- Customer "ask about my results" chat grounded in that pet's data
- MCP server at `/api/mcp` wrapping `packages/api` services, staff OAuth, permission-checked tools

## Data migration (when the AWS SQL dump arrives)
Restore into a scratch DB → `docs/LEGACY_MAPPING.md` → idempotent ETL into `packages/db/migrate-legacy/` keyed on `legacy_id` → reconciliation report (counts per status, revenue) → dry run on a Neon branch → cutover. Customer passwords move only if the hash format is importable into Clerk; otherwise send reset emails at cutover.

## Later
Expo mobile app with push notifications (M4), supplements & recommendations (M5), wholesale accounts.
