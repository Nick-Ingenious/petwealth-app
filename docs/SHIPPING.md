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
- A shipping address is required on the account (used for printed labels; QR returns don't send it to FedEx).

## Carriers
`packages/integrations/src/carrier` — services only see the `Carrier` interface.

| | When used | Notes |
|---|---|---|
| `FedExCarrier` | `FEDEX_API_KEY`, `FEDEX_SECRET_KEY`, `FEDEX_ACCOUNT_NUMBER` set | OAuth + **Returns API (label-less QR returns)** + Track API; Ship API printed labels only when the Returns settings are absent (never in production). Verified against the FedEx sandbox. |
| `TestCarrier` | No FedEx config, **never in Vercel production** | Real scannable QR; tracking simulated from label age: picked up at +10 min, delivered at +30 min. Mailers are tagged "Test carrier" in admin. |

### FedEx setup
Customers get a **label-less QR return**: the portal shows a QR code of the RMA number (e.g. `PWR0100001`), a FedEx counter scans it and prints the label. This is the FedEx Returns API (`/returns/v1/rma`), the same flow and settings the old Petwealth backend uses in production. FedEx holds the lab's address under a ship-to address id, and Petwealth pays (`shippingCostResponsibility: Retailer`). The customer's home address is not sent.

Set in Vercel on **both** projects, choosing the environment when you add each variable:

| Variable | Production | Preview + Development (sandbox) |
|---|---|---|
| `FEDEX_API_KEY`, `FEDEX_SECRET_KEY` | production key / secret (Sensitive) | test key / secret |
| `FEDEX_ACCOUNT_NUMBER` | real account | test account |
| `FEDEX_RETAILER_ID` | from the old app | `6067998` |
| `FEDEX_RETURN_SHIP_TO_ADDRESS_ID` | `TXLAB` | `TXLAB` |
| `FEDEX_RETURN_SKU` | `7681814_DEFAULT_ITEM` | `6067998_DEFAULT_ITEM` |

- The FedEx server follows the Vercel environment (Production → `apis.fedex.com`, everything else → sandbox).
- Fixed return details live in code (`RETURNS_DEFAULTS` in `fedex.ts`): service `FDXE`, reason "Diagnostic sample return to laboratory", Petwealth's phone and address.
- Production refuses to create returns unless all three Returns settings are set.
- **RMA numbers must not collide with the old app's.** FedEx keeps every RMA the old app created; ours start at `PWR0100000`. A collision fails the mailer with a clear message rather than reusing someone else's return. Retrying our own RMA (e.g. after a timeout) reuses it.
- Fallback (no Returns settings, never in production): printed PDF label via the Ship API, billed to our account (`SENDER`), service `FEDEX_RETURN_SERVICE_TYPE` (default `FEDEX_GROUND`; the sandbox can't ship Ground), to `LAB_SHIP_TO_*`.

## Tracking cron
`GET /api/cron/tracking`, scheduled in `apps/admin/vercel.json` (`*/30 * * * *`). Requires `Authorization: Bearer $CRON_SECRET` — Vercel sends it automatically once `CRON_SECRET` is set. Each shipment is polled at most every 25 minutes; safe to run manually.

## "Mail your sample" reminders
The notifications cron (`/api/cron/notifications`, every 10 min) queues a reminder email when a return mailer has its FedEx code but FedEx hasn't picked it up:
- **Day 3** after the code was created: "Ready to mail your sample?"
- **Day 10**: "Your FedEx code is still waiting". No more after that.
- The FedEx code (or label) is attached again. Mailers older than 21 days are ignored, so switching email on never nudges about long-forgotten kits.
- Skipped at send time if the mailer is already on its way, or if the reminder sat queued for more than 2 days.
- Runs only when email is configured. Template: `mail_sample_reminder` (`packages/api/src/emails/mail-sample-reminder.ts`).

## Outbound (open question)
Outbound kits aren't labelled in this app yet. If they're fulfilled in Shopify, the plan is to subscribe to Shopify's fulfillment event and record the outbound shipment, so the same cron marks kits **Kit Shipped → Kit Delivered** (the tracking logic for outbound already exists).

## Data model
`shipments` (one physical package; `direction`, `rma_number`, `tracking_number`, `status`, `label_format`, pickup/delivery times) ⟷ `shipment_kits` (which kits are inside) · `shipment_labels` (stored QR/PDF, served only via authenticated routes).
