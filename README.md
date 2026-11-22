# PetWealth Platform

Rebuild of the PetWealth admin + customer platform: pet health test kits sold on Shopify → shipped via FedEx → registered by the customer → tested by the lab → results explained with AI.

| App / package | What it is |
|---|---|
| `apps/admin` | Staff portal (admin.petwealth.com). Next.js 16, Clerk (Google sign-in), REST API `/api/v1`, API docs `/api/docs`. |
| `apps/portal` | Customer portal, mobile-first — **Milestone 2** |
| `apps/mobile` | Expo React Native app — **Milestone 4** |
| `packages/domain` | Pure business rules: kit lifecycle, kit codes, RBAC, validators. No I/O. |
| `packages/db` | Drizzle schema, migrations, seed, DB client (Postgres / Neon). |
| `packages/integrations` | Third-party adapters: Shopify, FedEx (+ dev test carrier); Twilio/lab next: signature checks + payload parsing, no DB access. |
| `packages/api` | Services — the only code that reads/writes data — and the OpenAPI contract. |
| `packages/ui` | Design tokens + React primitives shared by web apps. |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SHOPIFY.md](docs/SHOPIFY.md), [docs/SHIPPING.md](docs/SHIPPING.md) for how it fits together and [docs/ROADMAP.md](docs/ROADMAP.md) for what's next.

## Local development

Requires Node 22+ (24 recommended), pnpm 11, and Docker (or OrbStack).

```bash
pnpm install
cp .env.example .env          # then set AUTH_DEV_BYPASS_EMAIL=admin@petwealth.com to skip Clerk locally
pnpm db:up                    # Postgres on localhost:54329
pnpm db:migrate && pnpm db:seed
pnpm dev                      # admin on http://localhost:3001
```

`AUTH_DEV_BYPASS_EMAIL` signs you in as a seeded staff user without Clerk. It is ignored unless `NODE_ENV=development` **and** the app is not running on Vercel. Try other roles with `ops@`, `support@`, `lab@petwealth.com`.

## Checks

```bash
pnpm typecheck
pnpm test                                             # unit tests
RUN_DB_TESTS=1 pnpm --filter @petwealth/api test      # integration tests (mutate the dev DB; reseed after)
```

## Database changes

Edit `packages/db/src/schema.ts`, then `pnpm db:generate` (writes a SQL migration to review and commit) and `pnpm db:migrate`. Never edit an applied migration.
