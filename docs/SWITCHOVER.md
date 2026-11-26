# Switchover checklist: old app → new app

Moving customers and staff from the old AWS app to this one, on the final addresses:

| | Now (testing) | After switchover |
|---|---|---|
| Customer app (portal) | `app-v2.petwealth.com` | **`app.petwealth.com`** |
| Staff app (admin) | `admin-v2.petwealth.com` | **`admin.petwealth.com`** |

Keep the `-v2` addresses (and `*.perfectlaunch.ai`) attached afterwards: emails already sent link to them, and Twilio's toll-free verification uses the opt-in screenshots at `app-v2.petwealth.com/sms/…`.

Work top to bottom. **Part A** can happen any time before the day; **Part B** is the day itself; **Part C** is checking it worked.

---

## Part A: before the day

### A1. Clerk production (set up on the final addresses)
Clerk production instances live on a domain (DNS records like `clerk.<domain>`), so set them up on the final addresses directly rather than on `-v2` and redoing it later.

- [ ] **Staff** Clerk application (`petwealth-staff`): create the **Production** instance on `admin.petwealth.com`. Add the DNS records Clerk lists and wait for them to verify.
- [ ] **Staff sign-in with Google** in production needs your own Google OAuth client: in Google Cloud, create an OAuth client (Web), add the redirect URI Clerk shows, and paste the client ID and secret into Clerk. Keep sign-in limited to Google.
- [ ] **Customer** Clerk application (`petwealth-customers`): create the **Production** instance on `app.petwealth.com`, add its DNS records, and enable the same sign-in options as development (email, plus Google if you want it; Google needs its own OAuth client here too).
- [ ] Both instances: match the development settings (email verification on, sign-up allowed for customers; for staff, sign-up only through Google).
- [ ] Staff instance: **Agents → MCP servers → Add MCP server** `https://admin.petwealth.com/api/mcp`; **OAuth applications → Settings**: Include Audience on, Allow public clients on; `profile` and `email` scopes enabled (see [MCP.md](MCP.md)).

Nobody needs to be migrated between Clerk instances: the apps find staff and customers **by email** on their first sign-in, so existing records (orders, pets, kits, results) attach automatically. Everyone signs in fresh once.

### A2. Vercel domains and settings (prepare, don't switch yet)
- [ ] Add `app.petwealth.com` to the **petwealth-portal** project and `admin.petwealth.com` to **petwealth-admin**. Note the DNS records Vercel asks for, but **don't change DNS until Part B** if those addresses still serve the old app.
- [ ] Have these values ready for Part B (all **Production**, Sensitive where marked):

  | Project | Setting | Value |
  |---|---|---|
  | both | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | that app's production `pk_live_…` |
  | both | `CLERK_SECRET_KEY` (Sensitive) | that app's production `sk_live_…` |
  | both | `PORTAL_URL` | `https://app.petwealth.com` |
  | admin | `MCP_RESOURCE_URLS` | `https://admin.petwealth.com/api/mcp,https://admin-v2.petwealth.com/api/mcp,https://petwealth-admin.perfectlaunch.ai/api/mcp` (first = main address in assistant links) |

### A3. Data from the old app
- [ ] Get the AWS SQL dump, run the migration into a Neon branch, and review the reconciliation (customers, pets, kits, orders, results, counts per status). See ROADMAP "Data migration".
- [ ] Decide the cut-off: the old app stops taking new registrations at a set time; a final top-up migration runs right after.

### A4. Decide
- [ ] **Duplicate messages while both apps run:** who sends emails for kits registered in the old app (recommend: the old app stops sending at the cut-off; the new app sends from then on).
- [ ] **Anya's sign-off** on customer-facing copy: text alerts wording, pathogen descriptions.
- [ ] **Twilio:** toll-free number (855) 893-0444 shows **Verified** (texts are blocked until then).
- [ ] Twilio account upgraded from the free trial.

---

## Part B: the day

Pick a quiet time. Each step lists how to undo it.

1. [ ] **Freeze the old app:** stop new kit registrations and its outgoing emails/texts, and turn off the old app's Shopify webhooks so orders aren't processed twice. *(Undo: turn them back on.)*
2. [ ] **Final data top-up:** migrate anything created in the old app since A3 (idempotent; safe to rerun).
3. [ ] **RMA numbers:** the old app's return numbers run `PWR0100007` and up, and ours start at `PWR0100000`, so they overlap. Move ours past every old number. In the production database (Neon SQL editor):
   ```sql
   -- Check first: the highest old RMA must be below this.
   ALTER TABLE shipments ALTER COLUMN number RESTART WITH 500000;
   ```
   New mailers then get `PWR0500000` and up. Mailers already made keep their numbers. *(Only ever raise it; never lower it.)*
4. [ ] **Clerk production keys + `PORTAL_URL` + `MCP_RESOURCE_URLS`** in Vercel (the values from A2), for both projects.
5. [ ] **Redeploy both projects** (production). They now use the production Clerk instances, and email links point to `app.petwealth.com`.
6. [ ] **DNS:** point `app.petwealth.com` and `admin.petwealth.com` at Vercel (the records from A2). Wait until Vercel shows both as valid with certificates. *(Undo: point DNS back at AWS; the old app takes over again.)*
7. [ ] **Outside services → new addresses:**
   - **Shopify:** webhooks (`orders/paid`, `orders/cancelled`, `fulfillments/create`, `fulfillments/update`) → `https://admin.petwealth.com/api/webhooks/shopify`; the Shopify app's **App URL** and redirect URLs → `https://admin.petwealth.com`. Same signing secret, so nothing changes in Vercel. (See [SHOPIFY.md](SHOPIFY.md).)
   - **Twilio:** number (855) 893-0444 → "A message comes in" → `https://admin.petwealth.com/api/webhooks/twilio`, HTTP POST. Delivery receipts follow automatically.
   - **Staff assistant in Claude:** remove the old connector and add `https://admin.petwealth.com/api/mcp`.
8. [ ] **Update links you control** that point at the old app (petwealth.com site header/footer, Klaviyo emails, the kit booklet QR target if it isn't already `app.petwealth.com`).

---

## Part C: check it worked

- [ ] `https://admin.petwealth.com` → staff sign-in with Google, dashboard numbers look right, a kit page opens.
- [ ] `https://app.petwealth.com` → a customer signs up with an email that already has orders in the old app: their pets, kits and results are there.
- [ ] Scan a kit's QR code → lands on `app.petwealth.com/register?kits=…`, and after sign-in comes back to it.
- [ ] Register a test kit → FedEx QR code shown and emailed; the email's link opens `app.petwealth.com`; the RMA is `PWR05…`.
- [ ] Place a Shopify test order → appears in the admin within a minute (check Orders).
- [ ] Text alerts: with a test customer opted in, move a kit to "received at lab" → the text arrives (9am to 8pm their time). Reply STOP → text alerts turn off in My Information.
- [ ] `https://admin-v2.petwealth.com` and `https://app-v2.petwealth.com` still load (old links keep working), and `https://app-v2.petwealth.com/sms/opt-in-1-sign-up-phone.png` still opens.
- [ ] Staff assistant in Claude: "who am I" answers with your staff role.
- [ ] Next day: check Vercel logs for errors and the notifications job (`[cron:notifications]`) for failed emails or texts.

## Rollback
Point the DNS for `app.` and `admin.petwealth.com` back at AWS and turn the old app's registrations, messages and Shopify webhooks back on. The new app keeps running on the `-v2` addresses, so nothing in it is lost; anything registered in the new app in between needs moving back by hand.
