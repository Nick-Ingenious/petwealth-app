import { describe, expect, it } from "vitest";
import { describeKits, returnLabelReadyEmail, type ReturnLabelReadyData } from "./return-label-ready";

const base: ReturnLabelReadyData = {
  firstName: "Test",
  kits: [
    { code: "CFEC-903-101", petName: "Biscuit", panel: "fecal" },
    { code: "CORA-903-102", petName: "Biscuit", panel: "oral" },
  ],
  rmaNumber: "PWR0100000",
  label: { format: "qr_png", mimeType: "image/png", contentBase64: "QR" },
  kitUrl: "https://app.petwealth.com/kits/CFEC-903-101",
};

describe("describeKits", () => {
  it("groups tests by pet", () => {
    expect(describeKits(base.kits)).toBe("Biscuit's Fecal and Oral tests");
    expect(
      describeKits([
        { code: "a", petName: "Biscuit", panel: "fecal" },
        { code: "b", petName: "Mochi", panel: "respiratory" },
      ]),
    ).toBe("Biscuit's Fecal test and Mochi's Respiratory test");
    expect(describeKits([{ code: "a", petName: null, panel: "oral" }])).toBe("your pet's Oral test");
  });
});

describe("returnLabelReadyEmail", () => {
  it("shows the QR code inline and links to the kit", () => {
    const e = returnLabelReadyEmail(base);
    expect(e.subject).toBe("Your FedEx code is ready");
    expect(e.attachments).toEqual([{ filename: "fedex-code-PWR0100000.png", contentBase64: "QR", contentType: "image/png", contentId: "fedex-code" }]);
    expect(e.html).toContain('src="cid:fedex-code"');
    expect(e.html).toContain('src="https://app.petwealth.com/brand/email-logo.png"');
    expect(e.html).toContain("Hi Test, this code sends Biscuit&#39;s Fecal and Oral tests back to our lab in one mailer.");
    expect(e.html).toContain('href="https://app.petwealth.com/kits/CFEC-903-101"');
    expect(e.text).toContain("RMA Number: PWR0100000");
    expect(e.text).toContain("within 6 days of collecting");
  });

  it("attaches a printable label when FedEx gave a PDF", () => {
    const e = returnLabelReadyEmail({ ...base, label: { format: "pdf", mimeType: "application/pdf", contentBase64: "PDF" } });
    expect(e.subject).toBe("Your FedEx return label is ready");
    expect(e.attachments[0]).toMatchObject({ filename: "fedex-label-PWR0100000.pdf", contentType: "application/pdf" });
    expect(e.attachments[0]!.contentId).toBeUndefined();
    expect(e.html).not.toContain("cid:fedex-code");
  });

  it("escapes names and never uses em dashes", () => {
    const e = returnLabelReadyEmail({ ...base, firstName: "<b>Pat</b>" });
    expect(e.html).not.toContain("<b>Pat</b>");
    expect(e.html + e.text).not.toMatch(/[–—]/);
  });
});
