# Customer texts (SMS)

Texts go out alongside the emails, only to customers who ticked **text alerts** (onboarding, My Information, or SMS consent at Shopify checkout) and have a US number.

| Text | When | Example |
|---|---|---|
| `kit_in_transit` | FedEx picks up the mailer | Petwealth: Biscuit's sample is on the way to our lab. We'll text you when it arrives. {link} Reply STOP to opt out. |
| `kit_received` | Lab checks the kit in | Petwealth: Biscuit's sample reached our lab. Results usually take 24 to 48 hours. {link} Reply STOP to opt out. |
| `results_ready` | Results released | Petwealth: Biscuit's results are ready. See them in the app: {link} Reply STOP to opt out. |
| `mail_sample_reminder` | Day 3 and day 10 after the FedEx code, if not picked up | Petwealth: Ready to mail Biscuit's sample? Your FedEx code is in the app: {link} Reply STOP to opt out. |

Pet names are left out when any pet in the text has no name yet ("Your sample"). Templates: `packages/api/src/sms/kit-texts.ts`.

## Rules
- **Consent** is re-checked when sending, so a STOP that arrives after a text was queued still wins.
- **Quiet hours:** only 9am to 8pm in the customer's time zone (from the state on their default address; with no address, only when it's daytime on both coasts).
- **Grouping:** kits that change together (one mailer, a lab batch) share one text, like the emails.
- **Stale:** a text that couldn't go out within 24 hours is dropped, so switching SMS on never sends a backlog.
- **No duplicates:** each text is claimed before sending, and a timed-out request is not retried (Twilio has no idempotency key; a missed text beats a duplicate). Outages and rate limits are retried.
- **Replies:** STOP (and Twilio's other opt-out words) turns text alerts off and cancels queued texts; START turns them back on. Both are logged on the customer. Twilio sends the confirmation texts itself.
- **Delivery receipts** move a text from `sent` to `delivered` or `failed` in `notifications`.

## Turning it on (Twilio)
1. Create a Twilio account and buy a US local number.
2. **Register for A2P 10DLC** (Messaging > Regulatory compliance): a brand (Petwealth's business details and EIN) and a campaign, use case "Customer care" or "Account notifications". Use the message examples above, and the opt-in text from the portal's text alerts checkbox. Approval usually takes days to a few weeks; texts to US numbers are blocked until then.
3. Create a **Messaging Service**, add the number, and turn on **Advanced Opt-Out** (default STOP/START/HELP replies; set the HELP reply to include support@petwealth.com).
4. In the Messaging Service, **Integration > Incoming messages**: "Send a webhook" to `https://admin-v2.petwealth.com/api/webhooks/twilio` (POST).
5. In Vercel, project **petwealth-admin**, Production, mark each **Sensitive**:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_MESSAGING_SERVICE_SID` (or `TWILIO_FROM_NUMBER` in E.164 without a Messaging Service)
   - Optional `TWILIO_WEBHOOK_URL` if Twilio calls a different address than the one above.
6. Redeploy the admin. The notifications cron (every 10 minutes) starts sending.

Without these settings production sends no texts and logs `sms=off`. Previews and local development use a test sender that sends nothing.
