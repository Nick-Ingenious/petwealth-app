import { EmailError, type EmailMessage, type EmailSender } from "./types";

export type ResendConfig = {
  apiKey: string;
  /** e.g. "Petwealth <hello@petwealth.com>". The domain must be verified in Resend. */
  from: string;
  replyTo?: string;
  fetch?: typeof fetch;
};

/** Sends through Resend's REST API (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendEmailSender implements EmailSender {
  readonly name = "resend" as const;

  constructor(private readonly config: ResendConfig) {}

  async send(message: EmailMessage): Promise<{ id: string }> {
    const doFetch = this.config.fetch ?? fetch;
    let res: Response;
    try {
      res = await doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: this.config.from,
          to: [message.to],
          ...(this.config.replyTo ? { reply_to: this.config.replyTo } : {}),
          subject: message.subject,
          html: message.html,
          text: message.text,
          attachments: message.attachments?.map((a) => ({
            filename: a.filename,
            content: a.contentBase64,
            content_type: a.contentType,
            ...(a.contentId ? { content_id: a.contentId } : {}),
          })),
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new EmailError(`Could not reach Resend: ${e instanceof Error ? e.message : String(e)}`, true);
    }

    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) {
      const reason = body.message ?? `HTTP ${res.status}`;
      // 429 and 5xx are worth retrying; other 4xx (bad key, unverified domain, bad address) are not.
      throw new EmailError(`Resend rejected the email: ${reason}`, res.status === 429 || res.status >= 500);
    }
    return { id: body.id };
  }
}
