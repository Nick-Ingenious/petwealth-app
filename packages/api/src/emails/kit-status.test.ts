import { describe, expect, it } from "vitest";
import { kitStatusEmail, type KitStatusEmailData } from "./kit-status";

const one: KitStatusEmailData = {
  firstName: "Sam",
  kits: [{ code: "CFEC-903-101", petName: "Biscuit", panel: "fecal" }],
  kitUrl: "https://app.petwealth.com/kits/CFEC-903-101",
  trackingNumber: "794600000000",
};
const twoPets: KitStatusEmailData = {
  ...one,
  kits: [
    { code: "CFEC-903-101", petName: "Biscuit", panel: "fecal" },
    { code: "FORA-903-102", petName: "Mochi", panel: "oral" },
  ],
};

describe("kitStatusEmail", () => {
  it("on the way: links to FedEx tracking", () => {
    const e = kitStatusEmail("kit_in_transit", one);
    expect(e.subject).toBe("Biscuit's sample is on the way to our lab");
    expect(e.html).toContain('href="https://www.fedex.com/fedextrack/?trknbr=794600000000"');
    expect(e.text).toContain("Hi Sam, FedEx picked up the mailer with Biscuit's Fecal test.");
    expect(e.text).toContain("within 24 to 48 hours of the lab receiving your sample");
  });

  it("on the way without tracking falls back to the kit page", () => {
    const e = kitStatusEmail("kit_in_transit", { ...twoPets, trackingNumber: null });
    expect(e.subject).toBe("Your samples are on the way to our lab");
    expect(e.text).toContain("Open your kits in the app: https://app.petwealth.com/kits/CFEC-903-101");
    expect(e.text).not.toContain("tracking number");
  });

  it("received: names the pet and what comes next", () => {
    const e = kitStatusEmail("kit_received", { ...one, kits: [...one.kits, { code: "CORA-903-103", petName: "Biscuit", panel: "oral" }] });
    expect(e.subject).toBe("Biscuit's samples are at our lab");
    expect(e.text).toContain("our lab has received Biscuit's Fecal and Oral tests and will start testing right away.");
    expect(e.text).toContain("We'll email you when Biscuit's results are ready.");
  });

  it("results ready: no health details, links to the kit", () => {
    const e = kitStatusEmail("results_ready", one);
    expect(e.subject).toBe("Biscuit's results are ready");
    expect(e.text).toContain("See Biscuit's results: https://app.petwealth.com/kits/CFEC-903-101");
    expect(kitStatusEmail("results_ready", { ...one, firstName: null, kits: [{ ...one.kits[0]!, petName: null }] }).subject).toBe("Your pet's results are ready");
  });

  it("escapes names and never uses em or en dashes", () => {
    const e = kitStatusEmail("kit_received", { ...one, firstName: "<b>Sam</b>" });
    expect(e.html).toContain("Hi &lt;b&gt;Sam&lt;/b&gt;,");
    for (const t of ["kit_in_transit", "kit_received", "results_ready"] as const) {
      const all = kitStatusEmail(t, twoPets);
      expect(`${all.subject}${all.html}${all.text}`).not.toMatch(/[–—]/);
    }
  });
});
