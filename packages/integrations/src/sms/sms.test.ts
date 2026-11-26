import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getSmsSender, SmsError, smsKeyword, TestSmsSender, toUsE164, TwilioSmsSender, verifyTwilioSignature } from "./index";

describe("toUsE164", () => {
  it("accepts US numbers in any format", () => {
    for (const raw of ["4155550101", "(415) 555-0101", "+1 415 555 0101", "1-415-555-0101", "+14155550101"]) expect(toUsE164(raw)).toBe("+14155550101");
  });
  it("rejects what we can't text", () => {
    for (const raw of [null, "", "555-0101", "0155550101", "+44 20 7946 0958", "41555501019"]) expect(toUsE164(raw)).toBeNull();
  });
});

describe("verifyTwilioSignature", () => {
  const url = "https://admin.example.com/api/webhooks/twilio";
  const params = { From: "+14155550101", Body: "STOP", MessageSid: "SM1" };
  const sign = (u: string, p: Record<string, string>, token = "secret") =>
    createHmac("sha1", token).update(u + Object.keys(p).sort().map((k) => k + p[k]).join("")).digest("base64");

  it("accepts Twilio's signature and rejects tampering", () => {
    expect(verifyTwilioSignature(url, params, sign(url, params), "secret")).toBe(true);
    expect(verifyTwilioSignature(url, { ...params, Body: "START" }, sign(url, params), "secret")).toBe(false);
    expect(verifyTwilioSignature(url + "?x=1", params, sign(url, params), "secret")).toBe(false);
    expect(verifyTwilioSignature(url, params, sign(url, params, "other"), "secret")).toBe(false);
    expect(verifyTwilioSignature(url, params, null, "secret")).toBe(false);
  });
});

describe("smsKeyword", () => {
  it("knows Twilio's opt-out and opt-in words", () => {
    expect(smsKeyword(" stop ")).toBe("stop");
    expect(smsKeyword("Unsubscribe.")).toBe("stop");
    expect(smsKeyword("START")).toBe("start");
    expect(smsKeyword("help")).toBe("help");
    expect(smsKeyword("please stop texting me")).toBeNull(); // Twilio only acts on the bare keyword too
    expect(smsKeyword(undefined)).toBeNull();
  });
});

describe("TwilioSmsSender", () => {
  const ok = (calls: { url: string; init: RequestInit }[], status = 201, body: object = { sid: "SM123" }) =>
    (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;

  it("posts the text through the Messaging Service with basic auth", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const sender = new TwilioSmsSender({ accountSid: "AC1", authToken: "tok", messagingServiceSid: "MG1", statusCallbackUrl: "https://a/cb", fetch: ok(calls) });
    expect(await sender.send({ to: "+14155550101", body: "Hi" })).toEqual({ id: "SM123" });
    expect(calls[0]!.url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("AC1:tok").toString("base64")}`);
    const form = new URLSearchParams(String(calls[0]!.init.body));
    expect(Object.fromEntries(form)).toEqual({ To: "+14155550101", Body: "Hi", MessagingServiceSid: "MG1", StatusCallback: "https://a/cb" });
  });

  it("retries only when the text certainly wasn't sent", async () => {
    const send = (status: number) => new TwilioSmsSender({ accountSid: "AC1", authToken: "t", from: "+15125550100", fetch: ok([], status, { message: "nope", code: 21211 }) }).send({ to: "+14155550101", body: "x" });
    await expect(send(400)).rejects.toMatchObject({ retryable: false, message: expect.stringContaining("21211") });
    await expect(send(429)).rejects.toMatchObject({ retryable: true });
    await expect(send(503)).rejects.toMatchObject({ retryable: true });
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const slow = new TwilioSmsSender({ accountSid: "AC1", authToken: "t", from: "+15125550100", fetch: (async () => { throw timeout; }) as unknown as typeof fetch });
    await expect(slow.send({ to: "+14155550101", body: "x" })).rejects.toEqual(expect.objectContaining({ retryable: false }));
    const down = new TwilioSmsSender({ accountSid: "AC1", authToken: "t", from: "+15125550100", fetch: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch });
    await expect(down.send({ to: "+14155550101", body: "x" })).rejects.toBeInstanceOf(SmsError);
    await expect(down.send({ to: "+14155550101", body: "x" })).rejects.toMatchObject({ retryable: true });
  });
});

describe("getSmsSender", () => {
  it("uses Twilio when configured, nothing on production without it, and the test sender elsewhere", () => {
    expect(getSmsSender({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_MESSAGING_SERVICE_SID: " MG1 " })?.name).toBe("twilio");
    expect(getSmsSender({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", VERCEL_ENV: "production" })).toBeNull(); // no sender number
    expect(getSmsSender({ VERCEL_ENV: "production" })).toBeNull();
    expect(getSmsSender({})).toBeInstanceOf(TestSmsSender);
  });
});
