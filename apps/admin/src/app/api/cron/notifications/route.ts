import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { deliverQueuedEmails, deliverQueuedTexts, queueMailSampleReminders } from "@petwealth/api";
import { getEmailSender, type EmailSender } from "@petwealth/integrations/email";
import { getSmsSender } from "@petwealth/integrations/sms";

/**
 * Vercel Cron (every 10 min, see vercel.json): queue "mail your sample"
 * reminders that are due, then send queued emails and texts. This is where
 * kit status emails and texts (on the way, at the lab, results ready) go
 * out, and where ones that hit a provider outage are retried.
 *
 * Email (Resend) and texts (Twilio) are independent: either can be
 * configured without the other.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; anything else is rejected.
 */
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let email: EmailSender | null = null;
  try {
    email = getEmailSender();
  } catch (e) {
    // e.g. Resend not configured yet in production: emails stay queued, not an outage.
    console.warn(`[cron:notifications] email skipped: ${e instanceof Error ? e.message : String(e)}`);
  }
  // Twilio reports delivery back to the same deployment that sent the text.
  const sms = getSmsSender(process.env, { statusCallbackUrl: process.env.TWILIO_WEBHOOK_URL?.trim() || `${req.nextUrl.origin}/api/webhooks/twilio` });
  if (!email && !sms) return NextResponse.json({ ok: true, skipped: "email_and_sms_not_configured" });

  try {
    const reminders = await queueMailSampleReminders({ email: Boolean(email), sms: Boolean(sms) });
    const emails = email ? await deliverQueuedEmails({ sender: email, limit: 100 }) : null;
    const texts = sms ? await deliverQueuedTexts({ sender: sms, limit: 100 }) : null;
    console.info(
      `[cron:notifications] reminders=${reminders.queued}` +
        (emails ? ` email sent=${emails.sent} waiting=${emails.waiting} retrying=${emails.retrying} failed=${emails.failed} skipped=${emails.skipped}` : " email=off") +
        (texts ? ` sms sent=${texts.sent} waiting=${texts.waiting} retrying=${texts.retrying} failed=${texts.failed} skipped=${texts.skipped}` : " sms=off"),
    );
    return NextResponse.json({ ok: true, remindersQueued: reminders.queued, email: emails, sms: texts });
  } catch (e) {
    console.error("[cron:notifications] failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
