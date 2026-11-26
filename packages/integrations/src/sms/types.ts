export type SmsMessage = {
  /** E.164, e.g. +14155550101. */
  to: string;
  body: string;
};

export interface SmsSender {
  readonly name: "twilio" | "test";
  send(message: SmsMessage): Promise<{ id: string }>;
}

/**
 * A provider error. `retryable` is true only when the text certainly wasn't
 * sent (couldn't connect, rate limited, provider outage). Twilio has no
 * idempotency key, so a timeout after the request went out is not retried:
 * a missed text beats a duplicate.
 */
export class SmsError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "SmsError";
  }
}
