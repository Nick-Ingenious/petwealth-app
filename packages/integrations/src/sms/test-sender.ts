import { randomUUID } from "node:crypto";
import type { SmsMessage, SmsSender } from "./types";

/** Records texts instead of sending them (tests, local development, previews). */
export class TestSmsSender implements SmsSender {
  readonly name = "test" as const;
  readonly sent: SmsMessage[] = [];

  constructor(private readonly log = false) {}

  async send(message: SmsMessage): Promise<{ id: string }> {
    this.sent.push(message);
    if (this.log) console.info(`[sms:test] would text ${message.to.slice(0, -4)}•••• (${message.body.length} chars)`);
    return { id: `test_${randomUUID()}` };
  }
}
