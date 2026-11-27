# Shopify → Petwealth orders and shipping

Paid Shopify orders become Petwealth orders and kits automatically. Kits are
shipped by **ShipStation** (customers) and **Defender** (our 3PL); both write the
fulfilment and tracking back to Shopify, and we read it from there to mark kits
Shipped and Delivered.

```
Shopify ──(orders/paid, orders/cancelled,
          fulfillments/create, fulfillments/update)──► POST /api/webhooks/shopify
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
4. **Kits**: one per lab panel per unit; a Complete kit creates fecal + respiratory + oral kits. Kits start as `ordered` with no kit code. The code is attached when the customer scans the tube (it's matched to one of their ordered kits of the same type).
5. **Unrecognised physical products** don't block the order: recognised items still create kits, and the order shows a **Needs attention** banner. Non-shipping items (gift cards) are skipped; orders with no physical items at all are ignored.

## What happens on `orders/cancelled`
Kits still `ordered`/`label_created` are cancelled. Kits that already shipped are left alone and the order is flagged **Needs attention** so staff can arrange the return/refund.

## What happens on `fulfillments/create` and `fulfillments/update`
ShipStation or Defender ships the box and creates a fulfilment in Shopify with the carrier and tracking number.
1. We record an **outbound shipment** for the order (carrier, tracking number and link, fulfilment name), keyed on the Shopify fulfilment id so repeats are no-ops.
2. The fulfilment's line items are matched to the order's kits (line item id, then variant, SKU or title), and those kits move **Ordered → Shipped**. A fulfilment with no line items ships everything still waiting. No customer email is sent (the old app didn't send one either).
3. When Shopify reports the shipment **delivered**, the kits move **Shipped → Delivered**. FedEx outbound shipments are also checked by the tracking cron.
4. Once nothing on the order is waiting to ship, the order becomes **Fulfilled**. Cancelled or failed fulfilments flag the order **Needs attention** instead of moving kits back.

## Backfill (orders fulfilled before the webhooks were on)
**Orders → Sync shipping from Shopify** reads each open order's fulfilments from the Admin GraphQL API and applies them the same way (40 orders per click; run it again until nothing is left).

Access comes from a Dev Dashboard custom app (Shopify no longer issues copyable admin tokens for new apps):
1. Shopify admin → **Settings → Apps → Develop apps → Build apps in Dev Dashboard** → **Create app** (e.g. "Petwealth sync").
2. **Versions → Create version**, scopes `read_orders` and `read_fulfillments` (add `read_merchant_managed_fulfillment_orders` / `read_third_party_fulfillment_orders` only if Shopify asks) → **Release**.
3. **Install app** on the store.
4. App **Settings**: copy the **Client ID** and **Client secret** into Vercel (admin project, Production) as `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET`, both Sensitive.

Each sync asks Shopify for a fresh 24-hour token with the client credentials grant. A legacy custom app's token in `SHOPIFY_ADMIN_ACCESS_TOKEN` also works. `SHOPIFY_API_VERSION` overrides the API version if Shopify retires the default.

## Safety
- Requests without a valid `X-Shopify-Hmac-Sha256` signature over the raw body, or from a shop other than `SHOPIFY_SHOP_DOMAIN`, get **401**.
- Every delivery is stored in `webhook_events` keyed by `X-Shopify-Webhook-Id`, so retries are no-ops; an order is only ever imported once (`orders.shopify_order_id` is unique).
- Malformed payloads are recorded as `failed` and acknowledged (retrying can't fix them). Transient errors (database down) return **500** so Shopify retries for up to 48 h.
- Logs contain ids and outcomes only — never customer details.

## Setup (per environment)
1. In Shopify admin: **Settings → Notifications → Webhooks** (or a custom app's webhook subscriptions) → add **Order payment** (`orders/paid`), **Order cancellation** (`orders/cancelled`), **Fulfillment creation** (`fulfillments/create`) and **Fulfillment update** (`fulfillments/update`), format **JSON**, URL `https://<admin domain>/api/webhooks/shopify`.
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
