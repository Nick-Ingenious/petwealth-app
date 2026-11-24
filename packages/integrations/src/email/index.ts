import { ResendEmailSender } from "./resend";
import { TestEmailSender } from "./test-sender";
import type { EmailSender } from "./types";

export * from "./resend";
export * from "./test-sender";
export * from "./types";

/**
 * The email sender for this environment:
 * - Resend when EMAIL_PROVIDER=RESEND (or unset) and RESEND_API_KEY is set.
 *   From address: EMAIL_FROM (required in production; its domain must be
 *   verified in Resend). Elsewhere it defaults to Resend's shared test sender,
 *   which only delivers to the Resend account owner's address.
 * - otherwise the TestEmailSender, which sends nothing.
 * Vercel production requires Resend: a missing setting is an error there,
 * never a silent no-op.
 */
export function getEmailSender(env: Record<string, string | undefined> = process.env): EmailSender {
  const production = env.VERCEL_ENV === "production";
  const provider = env.EMAIL_PROVIDER?.trim().toUpperCase() || "RESEND";
  // Trimmed: a value pasted into Vercel with a stray space or line break breaks auth.
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  const replyTo = env.EMAIL_REPLY_TO?.trim() || undefined;

  if (provider !== "RESEND" && provider !== "TEST") throw new Error(`Unknown EMAIL_PROVIDER "${env.EMAIL_PROVIDER}". Use RESEND.`);
  if (provider === "RESEND" && apiKey) {
    if (production && !from) throw new Error("EMAIL_FROM is not set (e.g. Petwealth <hello@petwealth.com>).");
    return new ResendEmailSender({ apiKey, from: from || "Petwealth <onboarding@resend.dev>", replyTo });
  }
  if (production) throw new Error("Email is not configured (EMAIL_PROVIDER=RESEND, RESEND_API_KEY, EMAIL_FROM).");
  return new TestEmailSender(true);
}
