# Old app customer messaging

What the old (AWS) platform actually sends customers, and when. Reference for the rebuild's SMS work (ROADMAP 2c). Source: `Petwell-LLC/petwell-backend` on GitHub, read on 2026-11-23.

## Summary

- **The old app sends no text messages.** No repo in the `Petwell-LLC` org uses Twilio, AWS SNS SMS or any other SMS provider. `users` has an `sms_notifications` preference, but nothing reads it to send anything.
- **Email goes through Resend.** `services/email-transport.js` picks the provider from `EMAIL_PROVIDER` (default `RESEND`, fallback `SES`). Sender is `noreply@petwealth.com` as "Petwealth", support is `support@petwealth.com`. Despite the file name, `services/aws-ses.js` sends through this same transport.
- **Push notifications are never delivered.** Events are written to a `mobile_notifications` table and shown in the mobile app's inbox, but `services/mobile/push-dispatch.service.js` has no APNS/FCM credentials and logs "delivery skipped". Customers only see them if they open the app.
- If customers remember getting texts, they most likely came from Klaviyo or Shopify marketing flows, which are configured in those tools rather than in code.

So SMS is new work in the rebuild, with no old behavior to stay compatible with.

## In-app notification sequence

Defined in `services/mobile/notification-event.service.js`. `{Pet}` falls back to "Your pet" and `{panel}` is the kit type.

| # | Kind | Trigger | Title | Body |
|---|---|---|---|---|
| 1 | `order_placed` | Payment succeeds (`routes/payment.js`) | Order placed | Your order {orderId} has been placed. |
| 2 | `order_shipped` | Outbound tracking shows shipped, or admin marks shipped | Order shipped | Your order {orderId} has shipped. Tracking number: {n}. |
| 3 | `order_delivered` | Outbound tracking shows delivered | Order delivered | Your order {orderId} has been delivered. |
| 4 | `kit_reminder` | Daily cron, see below | Reminder to mail your sample | Please complete the sample collection steps and mail back kit {kitId}. |
| 5 | `sample_in_transit` | Return tracking shows movement | Sample on the way | {Pet}'s sample is on its way to the lab. |
| 6 | `sample_received_at_lab` | Lab checks the kit in, or tracking shows delivered to lab | Sample received | {Pet}'s sample has been received by the lab. |
| 7 | `sample_processing` | Lab starts processing | Sample processing | {Pet}'s {panel} is now being processed. |
| 8 | `report_available` | Results completed | Report available | {Pet}'s {panel} report is ready. |

De-duplication: order events once per order per 7 days; kit events once per kit per 24 hours.

### Sample reminder rule

`services/mobile-notification-reminder-cron.service.js`, daily at 9:00 America/New_York (`MOBILE_NOTIFICATION_REMINDER_CRON_SCHEDULE`, `_TZ`, `_ENABLED`).

- Kit status is `activated`, `assigned`, `sample_collected` or `sample_packed`, and it has not reached the lab.
- Kit was created at least 3 days ago (`MOBILE_KIT_REMINDER_AFTER_DAYS`).
- At most one reminder per kit every 7 days, with no cap on the total count. Max 500 per run.

## Emails actually sent (Resend)

| Email | Trigger | Subject |
|---|---|---|
| Kit shipped to lab | Return tracking shows movement (`services/tracking-sync.service.js`) | Your kit #{kit} has shipped to our lab |
| Kit received | Lab checks kit in (`routes/lab.js`) | Your kit #{kit} is at our lab |
| Report ready | PDF report generated (`services/health-report/pdf-report.service.js`) | 🐾 {Pet}'s Test Report is Ready - PetWealth |
| FedEx drop-off code | Return label created (`services/fedex-return-workflow.service.js`) | Your FedEx drop-off code is ready. |
| Product review request | Queued when the customer views their report, sent 4 days later (`PRODUCT_REVIEW_EMAIL_DELAY_DAYS`) | Would you review your {product}? (or "Would you share a quick Petwealth review?" for several products) |
| Rerun delay | Staff-triggered when a sample needs rerunning (`services/rerun-delay.service.js`) | Configurable template |
| Pre-order confirmation | Pre-order flow (`routes/aws-ses.js`) | Pre-Order Confirmed: #{order} |
| Team invite | Staff invites a user (`routes/userManagement.js`) | You're invited to join Petwealth |

Key email copy:

- **Kit shipped to lab:** "Great news! Your kit #{kit} has shipped to our lab." Tracking number, estimated delivery, "Track Your Package" button. Next steps: "Your return shipment is on its way to our lab." and "We will notify you when the lab receives and checks in your sample."
- **Kit received:** "Great news! Your kit #{kit} was received by our lab." Then: "We will begin processing your sample immediately and will contact you when results are ready. Results are typically available the same business day that the sample arrives at the lab."

### Written but switched off

These templates exist in `services/aws-ses.js` (and preview in `routes/email-preview.js`) but their send calls are commented out or have no caller: order confirmation, welcome, account activation, order delivered, and the billing set (upcoming charge, payment confirmed, payment failed, payment method updated, order cancelled). Shopify sends its own order confirmation.

## Compared with the rebuild

The rebuild texts (and emails) the moments that matter: sample on the way to the lab, received, results ready, and the mail-your-sample reminder (day 3 and day 10). See [SMS.md](SMS.md). Old messages with no rebuild equivalent: order placed, order delivered, sample processing and the review request.
