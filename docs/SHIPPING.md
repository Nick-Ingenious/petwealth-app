# Kit registration & return shipping (FedEx)

Mirrors the customer app flow (`app.petwealth.com`):

```
Customer scans tube QR ─► picks pet ─► "Register N kits"
        │
        ▼  registerKitsForCustomer  (one transaction)
   kits ─► activated ─► assigned (linked to pet)
   shipment (direction=return, status=pending, RMA PWR0100xxx) ◄─ every kit registered together
        │
        ▼  createReturnLabel ─► carrier (FedEx / test)
   QR code (show at a FedEx counter) or PDF label stored · email "return_label_ready" queued
        │   carrier error → status=failed + reason; registration kept; staff "Retry label"
        ▼  /api/cron/tracking  (Vercel Cron, every 30 min)
   picked up ─► shipment in_transit, kits "In Transit"
   delivered ─► shipment delivered; kits wait for the lab scan (Receive Kits → "Received at Lab")
```

## Rules
- **One mailer per registration**, up to **10 tubes** (`MAX_KITS_PER_MAILER`), one FedEx code, one RMA (`PWR` + 7 digits; new numbers start at `PWR0100000`, above the old app's).
- **Species must match the pet** (`FRES-…` is a cat kit). The kit code's type is fixed by its prefix.
- A tube is matched to the customer's **ordered kit of the same type** (from Shopify); otherwise a **standalone kit** is created (vet, wholesale, gift).
- A code registered to another account, or already in progress, is rejected (409).
- A shipping address is required (FedEx needs it as the return's origin).

## Carriers
`packages/integrations/src/carrier` — services only see the `Carrier` interface.

| | When used | Notes |
|---|---|---|
| `FedExCarrier` | `FEDEX_API_KEY`, `FEDEX_SECRET_KEY`, `FEDEX_ACCOUNT_NUMBER` set | OAuth + Ship API (return labels) + Track API. **Verify against the FedEx sandbox before production.** |
| `TestCarrier` | No FedEx config, **never in Vercel production** | Real scannable QR; tracking simulated from label age: picked up at +10 min, delivered at +30 min. Mailers are tagged "Test carrier" in admin. |

### FedEx setup
1. Create a project at **developer.fedex.com** with Ship + Track APIs; copy the sandbox API key/secret and test account number.
2. Set in Vercel: `FEDEX_API_KEY`, `FEDEX_SECRET_KEY`, `FEDEX_ACCOUNT_NUMBER`, `FEDEX_ENV=sandbox` (later `production`), `FEDEX_RETURN_SERVICE_TYPE` (default `FEDEX_GROUND` — **confirm the right service for biological samples with the lab**).
3. **QR codes at the counter** ("label-less returns") need **FedEx Returns Technology** enabled on the account — ask your FedEx account rep. Until then `FEDEX_RETURN_LABEL_MODE=label` (default) produces a printable PDF return label; switch to `qr` once enabled (the QR request mapping is finished then, against the sandbox).
4. Set the lab's receiving address: `LAB_SHIP_TO_NAME`, `LAB_SHIP_TO_COMPANY`, `LAB_SHIP_TO_PHONE`, `LAB_SHIP_TO_LINE1`, `LAB_SHIP_TO_LINE2`, `LAB_SHIP_TO_CITY`, `LAB_SHIP_TO_REGION`, `LAB_SHIP_TO_POSTAL_CODE`.

## Tracking cron
`GET /api/cron/tracking`, scheduled in `apps/admin/vercel.json` (`*/30 * * * *`). Requires `Authorization: Bearer $CRON_SECRET` — Vercel sends it automatically once `CRON_SECRET` is set. Each shipment is polled at most every 25 minutes; safe to run manually.

## Outbound (open question)
Outbound kits aren't labelled in this app yet. If they're fulfilled in Shopify, the plan is to subscribe to Shopify's fulfillment event and record the outbound shipment, so the same cron marks kits **Kit Shipped → Kit Delivered** (the tracking logic for outbound already exists).

## Data model
`shipments` (one physical package; `direction`, `rma_number`, `tracking_number`, `status`, `label_format`, pickup/delivery times) ⟷ `shipment_kits` (which kits are inside) · `shipment_labels` (stored QR/PDF, served only via authenticated routes).
