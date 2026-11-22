import { describe, expect, it } from "vitest";
import { onboardingSchema, petCreateSchema } from "./customer";

describe("onboarding", () => {
  it("accepts a complete profile and normalises phone + state", () => {
    const r = onboardingSchema.parse({
      firstName: " Nina ",
      lastName: "Park",
      phone: "(415) 555-0101",
      customerType: "pet_parent",
      smsOptIn: "on",
      address: { line1: "1 Main St", city: "SF", region: "ca", postalCode: "94110" },
    });
    expect(r).toMatchObject({ firstName: "Nina", phone: "4155550101", smsOptIn: true, address: { region: "CA", line2: null } });
  });

  it("requires names, phone and type; SMS consent defaults to off", () => {
    const r = onboardingSchema.safeParse({ firstName: "", lastName: "", phone: "12", customerType: "" });
    expect(r.success).toBe(false);
    expect(onboardingSchema.parse({ firstName: "A", lastName: "B", phone: "4155550101", customerType: "pet_professional" }).smsOptIn).toBe(false);
  });
});

describe("add pet", () => {
  const base = { name: "Felix", species: "cat", dateOfBirth: "2026-04-06", weightLbs: "7", breed: "American Bobtail", sex: "male", spayedNeutered: "yes" };
  it("parses the Add Pet form", () => {
    expect(petCreateSchema.parse(base)).toMatchObject({ weightLbs: 7, spayedNeutered: true, species: "cat" });
  });
  it("rejects future birthdays and missing answers", () => {
    expect(petCreateSchema.safeParse({ ...base, dateOfBirth: "2999-01-01" }).success).toBe(false);
    expect(petCreateSchema.safeParse({ ...base, spayedNeutered: undefined }).success).toBe(false);
    expect(petCreateSchema.safeParse({ ...base, weightLbs: "0" }).success).toBe(false);
  });
});
