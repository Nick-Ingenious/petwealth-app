import { describe, expect, it } from "vitest";
import { kitText, SMS_TEMPLATES } from "./kit-texts";
import { canTextNow, timeZoneForState } from "./quiet-hours";

const url = "https://app-v2.petwealth.com/kits/CFEC-999-001";

describe("kitText", () => {
  it("names the pet when we know it, and says how to opt out", () => {
    expect(kitText("kit_in_transit", { kits: [{ petName: "Biscuit" }], url })).toBe(
      `Petwealth: Biscuit's sample is on the way to our lab. We'll text you when it arrives. ${url} Reply STOP to opt out.`,
    );
    expect(kitText("results_ready", { kits: [{ petName: "Biscuit" }, { petName: "Mochi" }], url })).toBe(
      `Petwealth: Biscuit's and Mochi's results are ready. See them in the app: ${url} Reply STOP to opt out.`,
    );
    expect(kitText("kit_received", { kits: [{ petName: "Biscuit" }, { petName: "Biscuit" }], url })).toContain("Biscuit's samples reached our lab.");
  });

  it("leaves names out when any is missing", () => {
    expect(kitText("kit_in_transit", { kits: [{ petName: "Biscuit" }, { petName: null }], url })).toContain("Your samples are on the way to our lab. We'll text you when they arrive.");
    expect(kitText("mail_sample_reminder", { kits: [{ petName: null }], url })).toContain("Ready to mail your sample? Your FedEx code is in the app:");
    expect(kitText("mail_sample_reminder", { kits: [{ petName: "Rex" }], url, printedLabel: true })).toContain("Ready to mail Rex's sample? Your FedEx label is in the app:");
  });

  it("fits one text message with a typical name, with no dashes or exclamation marks", () => {
    for (const t of SMS_TEMPLATES) {
      const body = kitText(t, { kits: [{ petName: "Biscuit" }], url });
      expect(body.length, t).toBeLessThanOrEqual(160);
      expect(body).not.toMatch(/[\u2013\u2014!]/);
      expect(body.endsWith("Reply STOP to opt out.")).toBe(true);
    }
  });
});

describe("quiet hours", () => {
  it("maps states to time zones", () => {
    expect(timeZoneForState("tx")).toBe("America/Chicago");
    expect(timeZoneForState("AZ")).toBe("America/Phoenix");
    expect(timeZoneForState("ZZ")).toBeNull();
  });

  it("texts between 9am and 8pm local time only", () => {
    // 15:00 UTC in late November: 9am in Texas, 7am in California.
    const at = new Date("2026-11-25T15:00:00Z");
    expect(canTextNow("TX", at)).toBe(true);
    expect(canTextNow("CA", at)).toBe(false);
    expect(canTextNow("NY", new Date("2026-11-26T01:30:00Z"))).toBe(false); // 8:30pm in New York
  });

  it("without an address, waits until it's daytime on both coasts", () => {
    expect(canTextNow(null, new Date("2026-11-25T15:00:00Z"))).toBe(false); // 7am Pacific
    expect(canTextNow(null, new Date("2026-11-25T18:00:00Z"))).toBe(true); // 1pm Eastern, 10am Pacific
  });
});
