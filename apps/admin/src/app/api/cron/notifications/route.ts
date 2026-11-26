import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { deliverQueuedEmails, queueMailSampleReminders } from "@petwealth/api";
import { getEmailSender } from "@petwealth/integrations/email";

/**
 * Vercel Cron (every 10 min, see vercel.json): queue "mail your sample"
 * reminders that are due, then send queued emails. This is where kit status
 * emails (on the way, at the lab, results ready) go out, and where emails that
 * hit a Resend outage or rate limit are retried.
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
  let sender;
  try {
    sender = getEmailSender();
  } catch (e) {
    // e.g. Resend not configured yet in production: emails stay queued, not an outage.
    console.warn(`[cron:notifications] skipped: ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.json({ ok: true, skipped: "email_not_configured" });
  }
  try {
    const reminders = await queueMailSampleReminders();
    const result = await deliverQueuedEmails({ sender, limit: 100 });
    console.info(`[cron:notifications] reminders=${reminders.queued} sent=${result.sent} waiting=${result.waiting} retrying=${result.retrying} failed=${result.failed} skipped=${result.skipped}`);
    return NextResponse.json({ ok: true, remindersQueued: reminders.queued, ...result });
  } catch (e) {
    console.error("[cron:notifications] failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
