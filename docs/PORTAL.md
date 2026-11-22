# Customer portal (`apps/portal`, app.petwealth.com)

Mobile-first web app for pet parents, mirroring the existing customer app's flow.

| Screen | Route | Notes |
|---|---|---|
| Sign in / up | `/sign-in`, `/sign-up` | Customer Clerk instance (email + password) — separate from staff Clerk. |
| Set up your account (Step 1 of 2) | `/onboarding` | Name, phone, Pet Parent/Professional, explicit SMS consent (unticked), shipping address if we don't have one (Shopify customers already do). |
| Activate your kits (Step 2 of 2) | `/register` | Type or scan kit IDs (✓ check as you go), pick a pet per kit (filtered to the kit's species), add a pet inline. Everything registered together → one mailer, one FedEx code, ≤ 10 tubes. |
| Add Pet | `/pets/new` | Name, birthday, weight, species (locked by the kit), breed, sex, spayed/neutered. |
| Kit journey | `/kits/[code]` | Activate ✓ → Collect sample ("{pet}'s sample is collected") → Pack the mailer → Ship (QR to show at the FedEx counter / printable label, save, drop-off tip) → Awaiting results. |
| Dashboard | `/` | Kits in progress with their next step, pets, finished results. |

## QR deep links
Kit tubes can encode `https://app.petwealth.com/register?kit=FRES-001-937`. Scanning with the phone camera opens the portal with the kit pre-filled; the code survives sign-up and onboarding (`?next=`). The in-app scan button appears where the browser supports the Barcode Detection API (Chrome/Android); everywhere else, typing the ID printed under the QR works. **Confirm what the existing tubes' QR codes contain** — if they point to the old app's URL, add a redirect from that path.

## Security
- Every portal service takes the customer from the session and scopes every query to it — a customer can never read or change another customer's pets, kits or labels (covered by DB tests; other customers' kits/labels return 404).
- A first sign-in links to an existing (e.g. Shopify) customer only via a **verified** email; a different login can't claim an already-linked account; disabled accounts are refused.
- Post-onboarding redirects only go to same-site paths (no `//` or `\` tricks).

## Local development
```bash
# .env: AUTH_DEV_BYPASS_CUSTOMER_EMAIL=portal.demo@example.com  (dev only; ignored on Vercel)
pnpm --filter @petwealth/portal dev   # http://localhost:3002
```

## Not yet
Results report (2d), pet photos, editing pets/profile, "Email it" resend button, separate Vercel project + customer Clerk app (see README).
