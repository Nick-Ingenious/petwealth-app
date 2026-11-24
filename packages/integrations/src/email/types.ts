export type EmailAttachment = {
  filename: string;
  contentBase64: string;
  contentType: string;
  /** Set to show the attachment inline: reference it as `cid:<contentId>` in the HTML. */
  contentId?: string;
};

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
  /** Same key, same email: the provider drops repeats (e.g. a retry after a timeout). */
  idempotencyKey?: string;
};

export interface EmailSender {
  readonly name: "resend" | "test";
  send(message: EmailMessage): Promise<{ id: string }>;
}

/** A provider error. `retryable` is true for outages and rate limits, false for bad requests. */
export class EmailError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "EmailError";
  }
}
