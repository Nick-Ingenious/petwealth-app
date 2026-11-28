# Legacy data mapping (old AWS app → new app)

How data from the old app's Postgres database (`petwell-prod-postgres`, read through `petwell-read-replica-internal-apps`) maps into this app. The import keys every row on `legacy_id`, so it can run again safely (dry run, then a final top-up at switchover).

Source of truth for the old schema: `Petwell-LLC/petwell-backend` (`develop`), `migrations/` v01 to v166. There is no ORM; every table comes from a migration. Items marked *(inferred)* were deduced from code, not read from a schema; check them against the real data on the first dry run.

## General rules
- **Timestamps:** most old columns are `timestamp` without a time zone, written as UTC (`config/database.js` parses them with a `Z`). Convert with `AT TIME ZONE 'UTC'`.
- **Money:** `orders` amounts are dollars (`numeric`); ours are cents: `round(x * 100)::int`. `ecomm_payments.amount` is already cents.
- **Foreign keys:** most old foreign keys point at `users.auth0_user_id`, not `users.id`. The import keeps an auth0 id → customer lookup in memory only; auth0 ids are never stored.
- **legacy_id values:** plain old ids for customers (the smallest `users.id` of a merged group), pets and orders. Others are prefixed so they stay stable across runs: kits `kit:<code>` (placeholders `ph:<order>:<line>:<n>`), order items `<order>:<line>`, addresses `u:<user>:ship|bill` or `o:<order>:ship`, guest customers `guest:<email>`, shipments `o:<order>` (outbound), `f:<fedex return id>`, `r:<carrier>:<tracking>` (older returns), results and AI summaries `ps:<pet_score id>`, reruns `rq:<id>`. History events carry `legacyId` in their payload (`tsh:<id>`, `oc:<id>:<n>`).

## Running the import
Code: `packages/db/src/legacy/` (`transform.ts` holds the rules, `import.ts` runs them).

```bash
LEGACY_DATABASE_URL=postgres://…@localhost:15432/… DATABASE_URL=<target> pnpm --filter @petwealth/db legacy:import
```

- **Dry run by default.** Everything runs in one transaction that's rolled back; the report shows what would be created, reused and skipped (with example ids), plus reconciliation totals (orders, revenue, kits per status). Add `--apply` to save.
- **Read-only on the old side.** The old database is read in a read-only session, and password hashes and worker tokens are dropped before rows leave it.
- **Safe to rerun.** Rows are matched on `legacy_id` and updated. Rows the new app created itself (same customer email, Shopify order id, kit code, tracking or RMA number) are reused and never overwritten.
- **The old app is the source of truth until switchover.** A rerun overwrites imported rows with the old app's values, so don't work imported kits or orders in the new admin before the final top-up.
- **Files:** S3 files to copy (pet photos, return QR labels, report PDFs) are written to `legacy-files.json` (`--manifest <file>` to change). Copying them is a separate step that needs S3 access.
- **Test:** `LEGACY_IT_ADMIN_URL=postgres://petwealth:petwealth@localhost:54329/postgres pnpm --filter @petwealth/db test` runs the whole import against a made-up old database (`fixtures/legacy-sample.sql`), twice, and checks nothing duplicates.

## Customers and staff (`users`)
One old table holds both. `COALESCE(role, customer_type)` decides:
- `SUPER_ADMIN`, `MANAGER`, `OPS`, `CUSTOMER_SUPPORT`, `LAB_TECH` are staff: **not migrated**. Staff are added by hand in the new admin (User Management), along with their roles and permissions. `user_invitations` and the old permission tables aren't copied either.
- `PET_PARENT` → **customers** (`pet_parent`), `B2B_ADMIN` → `pet_professional`.
- Skip `auth0_user_id = 'deleted-user'` (placeholder for deleted accounts) and seed users `auth0|test_user_*`.

| Old | New `customers` | Notes |
|---|---|---|
| `id` | `legacyId` | |
| `lower(trim(email))` | `email` | Old emails aren't unique; see decision 1 |
| `first_name`, `last_name`, `phone` | same | |
| `contact_preference->>'sms'` | `smsOptIn` | default false |
| `is_active = false` | `status = 'disabled'` | |
| `last_login` or `created_at` when `first_time_login = false` | `onboardedAt` | *(inferred)* |
| (none) | `clerkUserId` | Empty; linked by email on first sign-in |

**Logins don't move.** Most old users signed in through Auth0. Mobile-app accounts have a bcrypt hash (`password_hash`). Neither is copied: customers sign in to Clerk with the same email and their records attach automatically.

## Addresses
- `users.shipping_address` → one default `addresses` row; `billing_address` only if different.
- Old jsonb keys vary (`line1`/`address1`/`street`, `state`/`region`/`province`/`province_code`, `postal_code`/`zip`, `country`/`country_code`, default `US`), the same rules as the old `utils/addressHelper.js`.
- `orders.shipping_address` (Shopify shape) → an address on the order's customer (deduplicated) and `orders.shippingAddressId`.
- Rows missing line 1, city, region or postal code are skipped and counted in the report.

## Pets (`animal`)
| Old | New `pets` | Notes |
|---|---|---|
| `id` | `legacyId` | |
| `owner_user_id` (auth0 id) | `customerId` | via the lookup |
| `name` | `name` | |
| `species` / `type` | `species` | dog, dogs, canine, k9 → dog; cat, feline → cat |
| `breeds.name` via `breed_id`, else `breed` | `breed` | |
| `date_of_birth` | `dateOfBirth` | |
| `gender` | `sex` | Male/Female, else unknown |
| `spayed` | `spayedNeutered` | As stored (decision 6) |
| `microchip`, `vet_notes`, `additional_notes` | new columns | decision 5 |
| `weight_pounds` | `weightLbs` | |
| `photo_url` where `photo_source = 'custom'` | `pet_photos` | Copied from S3 and resized; AI photos skipped |
| `status = 'deleted'` | (skipped) | unless a kit or result points at the pet |

## Orders
| Old | New `orders` | Notes |
|---|---|---|
| `id` | `legacyId` | |
| `user_id`, else match `lower(user_email)` | `customerId` | Shopify guest orders have no `user_id`; create a customer from the email if no match |
| `order_id` (`ORDER-GCS-…`) | `legacyOrderNumber` (new) | decision 4 |
| `status` | `status` | pending, placed, confirmed → open; shipped, delivered → fulfilled; cancelled → cancelled |
| `shopify_order_id` | `shopifyOrderId`, `source = shopify` | |
| `order_type` standard/bulk | `source = wholesale` | |
| Stripe-era (`shopify_webhook_id` like `pi_%`) | `source = legacy` | That column held Stripe payment ids before v130 |
| `total_amount`, `shipping_cost`, `discount_amount`, `tax_amount` | `*Cents` | ×100 |
| (no column) | `subtotalCents` | Sum of line items; cross-checked against total − shipping − tax + discount |
| `created_at` | `placedAt` | |
| `product_details[]` | `order_items` | One row per line; product by SKU or kit type |

## Kits
The old app splits a kit across three tables: `logistic_kits` (printed inventory), `order_kits` (kit allocated to an order) and `tests` (created when the customer activates a kit). One new `kits` row is built per kit code found in any of them.

- **Species and panel:** from the code (`CFEC-…` = dog fecal). Older codes have no species letter (`FEC-…`), so species comes from the pet or the order line.
- **Links:** order via `order_kits`, customer via `tests.owner_id` (else the order's customer), pet via `tests.animal_id`.
- **Careful:** `logistic_kits.status = 'activated'` means *allocated to an order*, not scanned by the customer. Kit status comes from `tests` or, before activation, from the order.

| Old | New `kit_status` |
|---|---|
| no `tests` row, order open | `ordered` (`label_created` if the order has a label) |
| no `tests` row, order shipped / delivered | `shipped` / `delivered` |
| `activated`, `assigned`, `sample_collected`, `in_transit`, `received_at_lab`, `processing`, `completed` | same |
| `sample_packed` | `sample_collected` |
| `awaiting_rerun` | `rerun` |
| `cancelled`, `expired` | `cancelled` |
| `finished`, `result_ready`, `results_ready` (should be gone since v124) | `completed` |

Timestamps: `shippedAt` from the order, `activatedAt` from `tests.created_at`, `receivedAt` from `received_at_lab_at`, `completedAt` from the result, `statusChangedAt` from `tests_status_history`.

## Shipments
- **Outbound:** orders with a `tracking_number` → `shipments` (`direction = outbound`), linked to the order's kits.
- **FedEx returns:** `fedex_return_shipments` → `shipments` (`direction = return`) with `rma_number`, tracking, QR label. Status: pending/processing → pending, created → label_created, cancelled → voided, others the same. Kits linked through `tests.fedex_return_shipment_id`.
- **Older returns:** `tests.tracking_number` without a FedEx return → one return shipment per tracking number.
- After import, move our RMA sequence past the highest old number (see SWITCHOVER.md).

## Lab results (`pet_score`)
- One row per kit (`test_id` is the kit code) → `lab_results`, `status = released`.
- `health_status`: Clean → clean, NeedsAttention → needs_attention, Critical → critical.
- Targets from `detected_pathogens` (detected) and `non_detected_pathogens` (not detected), with Cq values; per-well detail from `lab_run_results` where present.
- The full old row (minus personal fields) goes into `raw`. AI summary and recommendation text → `ai_reports` (`model = 'legacy'`).
- Report PDFs live in S3 and need copying.
- Open `lab_rerun_queue` items → `rerun_queue`.

## Not copied
- **Secrets and tokens:** `password_hash`, refresh tokens, push tokens, share-link tokens, FedEx worker tokens, payment gateway tokens, Stripe and HubSpot ids, `deleted_auth0_users`.
- **Superseded:** `mobile_notifications` (in-app feed), old SendGrid logs, reference tables now in code (`pathogens`, `panel_type`, `animal_species`), unallocated inventory in `logistic_kits`.

## Decisions (agreed 2026-11-28)
1. **Duplicate customer emails:** merge accounts that share an email into one customer, and move their pets, kits and orders to it.
2. **No owner, no migration:** kits and results whose owner was deleted in the old app (no owner and no email left) are skipped and counted in the report. Guest Shopify orders still have an email, so they get a customer.
3. **SKIN and LIFESTYLE panels; avian, reptile and other species:** skipped and listed in the report.
4. **Old order numbers** (`ORDER-GCS-…`): new `orders.legacy_order_number` column, searchable by staff.
5. **Pet fields:** new `pets` columns for microchip, vet notes and notes (old `additional_notes`). Where only age in months is known, an approximate birth date is set from it.
6. **Spayed/neutered:** imported as stored (most pets are, so the old default of yes is kept).
7. **Files in S3:** pet photos, return QR labels and report PDFs are copied during the import.
8. **History:** kit status history and order comments go into `events`. Staff names are kept as text, since old staff aren't migrated.
