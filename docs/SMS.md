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

## Turning it on (Twilio, toll-free number)
We text from a **toll-free number**, which needs toll-free verification (not A2P 10DLC). Until it's verified, carriers block texts from it.

**Status (2026-11-26):** number **(855) 893-0444**. Compliance profile complete; toll-free verification still **in review**. All three settings are set in production (`TWILIO_FROM_NUMBER` = `+18558930444`), so **texts are on** in the app. This was done before verification on purpose, while the app isn't live: until Twilio verifies the number, carriers block the texts and they're recorded as failed. Verify before customers rely on texts.

1. **Toll-free verification** (Twilio Console > Phone Numbers > the number > Regulatory / "Finish setting up your phone number"): business details, use case "Account notifications", the message examples above, and the opt-in text from the portal's text alerts checkbox. For **Opt-in policy proof**, use these screenshots of the sign-up screen (one per line):
   - `https://app-v2.petwealth.com/sms/opt-in-1-sign-up-phone.png`
   - `https://app-v2.petwealth.com/sms/opt-in-2-text-alerts-consent.png`

   Terms: `https://petwealth.com/pages/terms`. Privacy policy: `https://petwealth.com/pages/privacy-policy`, which should say mobile information isn't shared with third parties for marketing. Review usually takes a few days to two weeks.
2. **Replies:** on the number (Configure your number > Messaging), set "A message comes in" to *Webhook*, `https://admin-v2.petwealth.com/api/webhooks/twilio`, **HTTP POST**. Twilio sends the STOP, START and HELP confirmation texts itself (built in for toll-free numbers); the app records the change on the customer.
3. **Vercel**, project **petwealth-admin**, Production, each marked **Sensitive**:
   - `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`
   - `TWILIO_FROM_NUMBER`: the toll-free number in E.164 (`+18558930444`). It's the switch that turns texts on; removing it turns them off again.
   - Optional `TWILIO_WEBHOOK_URL` if Twilio calls a different address than the one above.
4. Redeploy the admin. The notifications cron (every 10 minutes) starts sending.
5. Make sure the Twilio account is upgraded from the free trial (a trial can only text verified numbers).

Without a sender number production sends no texts and logs `sms=off`, and the webhook answers `not_configured`. Previews and local development use a test sender that sends nothing.

A Messaging Service (`TWILIO_MESSAGING_SERVICE_SID`) also works instead of `TWILIO_FROM_NUMBER`, e.g. if we later add more numbers or move to 10DLC.
