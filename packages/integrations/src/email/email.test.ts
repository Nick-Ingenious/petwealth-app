import { describe, expect, it } from "vitest";
import { EmailError, ResendEmailSender, TestEmailSender, getEmailSender } from "./index";

const msg = { to: "pat@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi", idempotencyKey: "notification-1" };

describe("getEmailSender", () => {
  it("uses Resend when a key is set, trimming stray whitespace", () => {
    expect(getEmailSender({ EMAIL_PROVIDER: "RESEND", RESEND_API_KEY: " re_x\n" }).name).toBe("resend");
    expect(getEmailSender({ RESEND_API_KEY: "re_x" }).name).toBe("resend");
  });
  it("falls back to the test sender outside production", () => {
    expect(getEmailSender({}).name).toBe("test");
  });
  it("refuses to run production without Resend or a from address", () => {
    expect(() => getEmailSender({ VERCEL_ENV: "production" })).toThrow(/not configured/);
    expect(() => getEmailSender({ VERCEL_ENV: "production", RESEND_API_KEY: "re_x" })).toThrow(/EMAIL_FROM/);
    expect(getEmailSender({ VERCEL_ENV: "production", RESEND_API_KEY: "re_x", EMAIL_FROM: "Petwealth <hi@petwealth.com>" }).name).toBe("resend");
  });
  it("rejects an unknown provider", () => {
    expect(() => getEmailSender({ EMAIL_PROVIDER: "SENDGRID" })).toThrow(/Unknown EMAIL_PROVIDER/);
  });
});

describe("ResendEmailSender", () => {
  it("posts the message with auth and idempotency headers", async () => {
    let call: { url: string; init: RequestInit } | undefined;
    const sender = new ResendEmailSender({
      apiKey: "re_test",
      from: "Petwealth <hi@petwealth.com>",
      fetch: (async (url: string, init: RequestInit) => {
        call = { url, init };
        return new Response(JSON.stringify({ id: "em_1" }), { status: 200 });
      }) as typeof fetch,
    });
    const res = await sender.send({ ...msg, attachments: [{ filename: "qr.png", contentBase64: "AAA", contentType: "image/png", contentId: "qr" }] });
    expect(res).toEqual({ id: "em_1" });
    expect(call!.url).toBe("https://api.resend.com/emails");
    const headers = call!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test");
    expect(headers["Idempotency-Key"]).toBe("notification-1");
    const body = JSON.parse(String(call!.init.body));
    expect(body).toMatchObject({ from: "Petwealth <hi@petwealth.com>", to: ["pat@example.com"], subject: "Hi" });
    expect(body.attachments[0]).toEqual({ filename: "qr.png", content: "AAA", content_type: "image/png", content_id: "qr" });
  });

  it("marks bad requests as final and outages as retryable", async () => {
    const respond = (status: number) =>
      new ResendEmailSender({ apiKey: "k", from: "f", fetch: (async () => new Response(JSON.stringify({ message: "nope" }), { status })) as typeof fetch });
    await expect(respond(403).send(msg)).rejects.toMatchObject({ retryable: false, message: "Resend rejected the email: nope" });
    await expect(respond(429).send(msg)).rejects.toMatchObject({ retryable: true });
    await expect(respond(503).send(msg)).rejects.toBeInstanceOf(EmailError);
  });
});

describe("TestEmailSender", () => {
  it("keeps what it sent", async () => {
    const t = new TestEmailSender();
    await t.send(msg);
    expect(t.sent).toHaveLength(1);
  });
});
