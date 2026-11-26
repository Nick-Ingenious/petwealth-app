import { createHmac, timingSafeEqual } from "node:crypto";
import { SmsError, type SmsMessage, type SmsSender } from "./types";

export type TwilioConfig = {
  accountSid: string;
  authToken: string;
  /** Preferred (A2P 10DLC): the Messaging Service that owns the registered number. */
  messagingServiceSid?: string;
  /** Or a single sending number in E.164. */
  from?: string;
  /** Where Twilio reports delivery (sent, delivered, failed). */
  statusCallbackUrl?: string;
  fetch?: typeof fetch;
};

/** Sends through Twilio's Messages API (https://www.twilio.com/docs/messaging/api/message-resource). */
export class TwilioSmsSender implements SmsSender {
  readonly name = "twilio" as const;

  constructor(private readonly config: TwilioConfig) {
    if (!config.messagingServiceSid && !config.from) throw new Error("Twilio needs TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER.");
  }

  async send(message: SmsMessage): Promise<{ id: string }> {
    const { accountSid, authToken, messagingServiceSid, from, statusCallbackUrl } = this.config;
    const form = new URLSearchParams({ To: message.to, Body: message.body });
    if (messagingServiceSid) form.set("MessagingServiceSid", messagingServiceSid);
    else form.set("From", from!);
    if (statusCallbackUrl) form.set("StatusCallback", statusCallbackUrl);

    let res: Response;
    try {
      res = await (this.config.fetch ?? fetch)(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      // A timeout may mean Twilio got it; only a failed connection is safe to retry.
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new SmsError(`Could not reach Twilio: ${e instanceof Error ? e.message : String(e)}`, !timedOut);
    }
    const body = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (!res.ok || !body.sid) {
      const reason = `${body.message ?? `HTTP ${res.status}`}${body.code ? ` (Twilio ${body.code})` : ""}`;
      throw new SmsError(`Twilio rejected the text: ${reason}`, res.status === 429 || res.status >= 500);
    }
    return { id: body.sid };
  }
}

/**
 * Check X-Twilio-Signature: HMAC-SHA1 (auth token) over the full webhook URL
 * followed by each POST parameter name and value, sorted by name.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function verifyTwilioSignature(url: string, params: Record<string, string>, signature: string | null, authToken: string): boolean {
  if (!signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", authToken).update(data, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"]);
const START_WORDS = new Set(["START", "YES", "UNSTOP"]);

/** What an incoming text means for consent: Twilio's standard opt-out and opt-in keywords. */
export function smsKeyword(body: string | null | undefined): "stop" | "start" | "help" | null {
  const word = (body ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (STOP_WORDS.has(word)) return "stop";
  if (START_WORDS.has(word)) return "start";
  if (word === "HELP" || word === "INFO") return "help";
  return null;
}
