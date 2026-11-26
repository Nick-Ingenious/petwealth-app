import { NextResponse, type NextRequest } from "next/server";
import { handleTwilioWebhook } from "@petwealth/api";
import { twilioSettings, verifyTwilioSignature } from "@petwealth/integrations/sms";

/**
 * Twilio webhook: replies to our texts (STOP / START) and delivery receipts.
 * In the Twilio Messaging Service, set "incoming messages" to
 * https://<admin-domain>/api/webhooks/twilio. Delivery receipts come here
 * automatically (the sender sets StatusCallback).
 *
 * Public (no staff session): authenticity comes from X-Twilio-Signature,
 * signed with the account's auth token over the exact URL Twilio called.
 */
export async function POST(req: NextRequest) {
  const settings = twilioSettings();
  if (!settings) {
    console.error("[twilio] TWILIO_* not configured");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const params = Object.fromEntries(new URLSearchParams(await req.text()));
  // The URL Twilio signed: the public one it called, not the internal one.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const publicUrl = `https://${host}${req.nextUrl.pathname}${req.nextUrl.search}`;
  const candidates = [process.env.TWILIO_WEBHOOK_URL?.trim(), publicUrl].filter((u): u is string => Boolean(u));
  const signature = req.headers.get("x-twilio-signature");
  if (!candidates.some((url) => verifyTwilioSignature(url, params, signature, settings.authToken))) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  try {
    const out = await handleTwilioWebhook(params);
    // Outcome only; never phone numbers or message text.
    console.info(`[twilio] ${out.outcome}${out.customers !== undefined ? ` (${out.customers} customers)` : ""}`);
  } catch (e) {
    console.error("[twilio] webhook failed; Twilio will retry", e);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
  // Empty TwiML: Twilio's Advanced Opt-Out sends the STOP/START/HELP confirmations.
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', { headers: { "content-type": "text/xml" } });
}
