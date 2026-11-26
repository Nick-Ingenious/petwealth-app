import { describe, expect, it } from "vitest";
import { describeReminderKits, mailSampleReminderEmail, type MailSampleReminderData } from "./mail-sample-reminder";

const base: MailSampleReminderData = {
  reminder: 1,
  firstName: "Test",
  kits: [{ code: "CFEC-903-101", petName: "Biscuit", panel: "fecal" }],
  rmaNumber: "PWR0100000",
  label: { format: "qr_png", mimeType: "image/png", contentBase64: "QR" },
  kitUrl: "https://app.petwealth.com/kits/CFEC-903-101",
};

describe("describeReminderKits", () => {
  it("uses pet names only when every kit has one", () => {
    expect(describeReminderKits([{ code: "a", petName: "Biscuit", panel: "fecal" }, { code: "b", petName: "Biscuit", panel: "oral" }])).toBe("Biscuit's Fecal and Oral tests");
    expect(describeReminderKits([{ code: "a", petName: null, panel: "fecal" }])).toBe("your Fecal test");
    expect(describeReminderKits([{ code: "a", petName: "Biscuit", panel: "fecal" }, { code: "b", petName: null, panel: "oral" }])).toBe("your Fecal and Oral tests");
    expect(describeReminderKits([{ code: "a", petName: null, panel: "fecal" }, { code: "b", petName: " ", panel: "fecal" }])).toBe("your Fecal tests");
  });
});

describe("mailSampleReminderEmail", () => {
  it("reads naturally without a pet name", () => {
    const e = mailSampleReminderEmail({ ...base, kits: [{ code: "CFEC-903-101", petName: null, panel: "fecal" }] });
    expect(e.text).toContain("Hi Test, our lab is ready for your Fecal test.");
    const e2 = mailSampleReminderEmail({ ...base, reminder: 2, firstName: null, kits: [{ code: "CFEC-903-101", petName: null, panel: "fecal" }] });
    expect(e2.text).toContain("Hi, FedEx hasn't scanned the mailer with your Fecal test yet.");
  });

  it("nudges gently, with the FedEx code attached again", () => {
    const e = mailSampleReminderEmail(base);
    expect(e.subject).toBe("Ready to mail your sample?");
    expect(e.html).toContain("Hi Test, our lab is ready for Biscuit&#39;s Fecal test.");
    expect(e.html).toContain('src="cid:fedex-code"');
    expect(e.html).toContain('href="https://app.petwealth.com/kits/CFEC-903-101"');
    expect(e.attachments).toEqual([{ filename: "fedex-code-PWR0100000.png", contentBase64: "QR", contentType: "image/png", contentId: "fedex-code" }]);
    expect(e.text).toContain("Already dropped it off?");
    expect(e.text).toContain("within 6 days of collecting");
  });

  it("words the second reminder differently, and handles printed labels", () => {
    const e = mailSampleReminderEmail({ ...base, reminder: 2, label: { format: "pdf", mimeType: "application/pdf", contentBase64: "PDF" } });
    expect(e.subject).toBe("Your FedEx label is still waiting");
    expect(e.attachments[0]).toMatchObject({ filename: "fedex-label-PWR0100000.pdf" });
    expect(e.html).not.toContain("cid:fedex-code");
  });

  it("has no em or en dashes", () => {
    for (const r of [1, 2] as const) {
      const e = mailSampleReminderEmail({ ...base, reminder: r });
      expect(e.html + e.text + e.subject).not.toMatch(/[\u2013\u2014]/);
    }
  });
});
