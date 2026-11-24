import { randomUUID } from "node:crypto";
import type { EmailMessage, EmailSender } from "./types";

/**
 * Development/test sender. NEVER used in production (see getEmailSender).
 * Keeps what it "sent" so tests can inspect it, and can log a one-line summary.
 */
export class TestEmailSender implements EmailSender {
  readonly name = "test" as const;
  readonly sent: EmailMessage[] = [];

  constructor(private readonly log = false) {}

  async send(message: EmailMessage): Promise<{ id: string }> {
    this.sent.push(message);
    if (this.log) console.info(`[email:test] would send "${message.subject}" (${message.attachments?.length ?? 0} attachments)`);
    return { id: `test_${randomUUID()}` };
  }
}
