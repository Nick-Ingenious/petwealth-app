import { TestSmsSender } from "./test-sender";
import { TwilioSmsSender } from "./twilio";
import type { SmsSender } from "./types";

export * from "./phone";
export * from "./test-sender";
export * from "./twilio";
export * from "./types";

/** Twilio settings, if this environment has them. */
export function twilioSettings(env: Record<string, string | undefined> = process.env) {
  // Trimmed: a value pasted into Vercel with a stray space or line break breaks auth.
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const messagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID?.trim() || undefined;
  const from = env.TWILIO_FROM_NUMBER?.trim() || undefined;
  if (!accountSid || !authToken || (!messagingServiceSid && !from)) return null;
  return { accountSid, authToken, messagingServiceSid, from };
}

/**
 * The SMS sender for this environment, or null when texts are off:
 * - Twilio when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and a sender
 *   (TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER) are set.
 * - On Vercel production without them: null. Texts are optional, so the
 *   notifications cron just skips them (and drops stale ones later).
 * - Elsewhere: the TestSmsSender, which sends nothing.
 */
export function getSmsSender(env: Record<string, string | undefined> = process.env, opts: { statusCallbackUrl?: string } = {}): SmsSender | null {
  const settings = twilioSettings(env);
  if (settings) return new TwilioSmsSender({ ...settings, statusCallbackUrl: opts.statusCallbackUrl });
  if (env.VERCEL_ENV === "production") return null;
  return new TestSmsSender(true);
}
