# Shopify → PetWealth order intake

Paid Shopify orders become PetWealth orders and kits automatically.

```
Shopify ──(orders/paid, orders/cancelled)──► POST /api/webhooks/shopify
            signed with HMAC-SHA256             │ verify signature + shop domain
                                                ▼
                                  webhook_events (dedupe, audit, replay)
                                                ▼
                         packages/api/src/services/shopify.ts
                  customer ▸ address ▸ order ▸ order items ▸ kits (status "ordered")
```

## What happens on `orders/paid`
1. **Customer** is matched by Shopify customer id, then by email (case-insensitive). New customers are created; for existing ones we only *fill gaps* (missing phone/name) and never overwrite edits.
2. **Shipping address** is reused if the same street + ZIP already exists for that customer.
3. **Products** are matched by Shopify variant id → SKU → product title (`"Dog Respiratory Health Kit"`, `"Cat Complete Health Kit"`, …). A recognised title with no catalog row creates one, so the catalog fills itself. The variant id is remembered for next time.
4. **Kits** — one per lab panel per unit: a Complete kit creates fecal + respiratory + oral kits. Kits start as `ordered` with no kit code; codes and FedEx labels are assigned at fulfilment (Milestone 2b).
5. **Unrecognised physical products** don't block the order: recognised items still create kits, and the order shows a **Needs attention** banner. Non-shipping items (gift cards) are skipped; orders with no physical items at all are ignored.

## What happens on `orders/cancelled`
Kits still `ordered`/`label_created` are cancelled. Kits that already shipped are left alone and the order is flagged **Needs attention** so staff can arrange the return/refund.

## Safety
- Requests without a valid `X-Shopify-Hmac-Sha256` signature over the raw body, or from a shop other than `SHOPIFY_SHOP_DOMAIN`, get **401**.
- Every delivery is stored in `webhook_events` keyed by `X-Shopify-Webhook-Id`, so retries are no-ops; an order is only ever imported once (`orders.shopify_order_id` is unique).
- Malformed payloads are recorded as `failed` and acknowledged (retrying can't fix them). Transient errors (database down) return **500** so Shopify retries for up to 48 h.
- Logs contain ids and outcomes only — never customer details.

## Setup (per environment)
1. In Shopify admin: **Settings → Notifications → Webhooks** (or a custom app's webhook subscriptions) → add **Order payment** (`orders/paid`) and **Order cancellation** (`orders/cancelled`), format **JSON**, URL `https://<admin domain>/api/webhooks/shopify`.
2. Copy the webhook **signing secret** into Vercel as `SHOPIFY_WEBHOOK_SECRET`, and set `SHOPIFY_SHOP_DOMAIN` to the store's `*.myshopify.com` domain.
3. Optional: `SHOPIFY_ACCEPT_TEST_ORDERS` (default: accepted everywhere except Vercel production) and `SHOPIFY_SMS_CONSENT_MODE` (below).
4. Place a test order and check it appears under **Orders**.

> Preview deployments sit behind Vercel Deployment Protection, which blocks Shopify. Point Shopify at production, or add a protection-bypass for automation to the webhook URL when testing a preview.

## Decision needed: SMS consent
`SHOPIFY_SMS_CONSENT_MODE` controls whether a new customer is opted in to kit/result texts:
- `marketing_consent` *(default, safest)* — only if they ticked "text me" (SMS marketing consent) at checkout.
- `checkout_phone` — anyone who gave a phone number. Common for transactional order updates, but confirm with counsel and make sure checkout discloses it.

Customers can always be opted in/out on their Customers page; STOP replies will opt out automatically once SMS sending lands (2c).

## Local testing
```bash
# .env needs SHOPIFY_WEBHOOK_SECRET and SHOPIFY_SHOP_DOMAIN (any values locally)
pnpm --filter @petwealth/integrations shopify:send                                  # new paid order
pnpm --filter @petwealth/integrations shopify:send -- --id 123 --again              # retry same delivery
pnpm --filter @petwealth/integrations shopify:send -- --id 123 --topic orders/cancelled
pnpm --filter @petwealth/integrations shopify:send -- --file path/to/payload.json   # your own payload
```
