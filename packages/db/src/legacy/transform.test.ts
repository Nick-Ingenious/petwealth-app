import { describe, expect, it } from "vitest";
import * as t from "./transform";

describe("legacy conversion rules", () => {
  it("reads old UTC timestamps with and without a zone", () => {
    expect(t.utc("2026-01-02T03:04:05.123456")?.toISOString()).toBe("2026-01-02T03:04:05.123Z");
    expect(t.utc("2026-01-02 03:04:05")?.toISOString()).toBe("2026-01-02T03:04:05.000Z");
    expect(t.utc("2026-01-02T03:04:05+00:00")?.toISOString()).toBe("2026-01-02T03:04:05.000Z");
    expect(t.utc(null)).toBeNull();
  });

  it("turns dollars into cents", () => {
    expect(t.cents("99.00")).toBe(9900);
    expect(t.cents(12.345)).toBe(1235);
    expect(t.cents("$1,299.99")).toBe(129999);
    expect(t.cents(null)).toBe(0);
  });

  it("leaves staff and placeholder users out", () => {
    expect(t.userKind({ email: "a@x.com", role: "OPS" })).toBe("staff");
    expect(t.userKind({ email: "a@x.com", customer_type: "LAB_TECH" })).toBe("staff");
    expect(t.userKind({ email: "a@x.com", role: "PET_PARENT" })).toBe("customer");
    expect(t.userKind({ email: "deleted-user@petwealth.invalid", auth0_user_id: "deleted-user" })).toBe("skip");
    expect(t.userKind({ email: "", role: "PET_PARENT" })).toBe("skip");
  });

  it("merges accounts that share an email, newest first", () => {
    const merged = t.mergeUsers([
      { id: 5, first_name: "Old", phone: "555", last_login: "2025-01-01T00:00:00", created_at: "2024-01-01T00:00:00", contact_preference: { sms: true } },
      { id: 9, first_name: "New", phone: null, last_login: "2026-01-01T00:00:00", created_at: "2025-06-01T00:00:00", contact_preference: { sms: false } },
    ]);
    expect(merged.first_name).toBe("New");
    expect(merged.phone).toBe("555");
    expect(t.smsOptIn(merged)).toBe(true);
    expect(merged.created_at).toBe("2024-01-01T00:00:00.000Z");
    expect(t.groupLegacyId([{ id: 9 }, { id: 5 }])).toBe("5");
  });

  it("normalises the old address shapes", () => {
    expect(t.normalizeAddress({ address1: "1 Main St", city: "Austin", province_code: "TX", zip: "78701", country_code: "US" })).toEqual({
      line1: "1 Main St",
      line2: null,
      city: "Austin",
      region: "TX",
      postalCode: "78701",
      country: "US",
    });
    expect(t.normalizeAddress('{"line1":"2 Oak","city":"Reno","state":"NV","postal_code":"89501","country":"United States"}')?.country).toBe("US");
    expect(t.normalizeAddress({ line1: "2 Oak", city: "Reno" })).toBeNull();
  });

  it("maps pets", () => {
    expect(t.petSpecies({ species: "Dog" })).toBe("dog");
    expect(t.petSpecies({ species: null, type: "feline" })).toBe("cat");
    expect(t.petSpecies({ type: "avian" })).toBeNull();
    expect(t.petSex("Female")).toBe("female");
    expect(t.petDateOfBirth({ age_months: 24, updated_at: "2026-06-15T00:00:00" })).toBe("2024-06-01");
    expect(t.petDateOfBirth({ date_of_birth: "2020-03-04" })).toBe("2020-03-04");
  });

  it("maps order status, source and lines", () => {
    expect(t.orderStatus("placed")).toBe("open");
    expect(t.orderStatus("delivered")).toBe("fulfilled");
    expect(t.orderStatus("cancelled")).toBe("cancelled");
    expect(t.orderSource({ shopify_order_id: "123" })).toBe("shopify");
    expect(t.orderSource({ order_type: "bulk" })).toBe("wholesale");
    expect(t.orderSource({ shopify_webhook_id: "pi_123" })).toBe("legacy");
    const lines = t.orderLines({
      product_details: [
        { name: "Canine Fecal Kit", quantity: 2, unit_price: "99.00", species: "canine", kit_type: "Canine Fecal Kit" },
        '{"name":"Complete Feline Health Kit","quantity":1,"unit_price":"279.00"}',
      ],
    });
    expect(lines[0]).toMatchObject({ species: "dog", testType: "fecal", quantity: 2, unitPriceCents: 9900 });
    expect(lines[1]).toMatchObject({ species: "cat", testType: "complete", unitPriceCents: 27900 });
  });

  it("reads kit codes, old and new", () => {
    expect(t.parseLegacyKitCode("CFEC-002-946")).toEqual({ species: "dog", panel: "fecal", standard: true });
    expect(t.parseLegacyKitCode("ORA-001-002")).toEqual({ species: null, panel: "oral", standard: false });
    expect(t.panelFromText("Feline Respiratory Kit")).toBe("respiratory");
    expect(t.panelFromText("SKIN")).toBeNull();
  });

  it("maps kit statuses", () => {
    expect(t.kitStatusFromTest("sample_packed")).toBe("sample_collected");
    expect(t.kitStatusFromTest("awaiting_rerun")).toBe("rerun");
    expect(t.kitStatusFromTest("expired")).toBe("cancelled");
    expect(t.kitStatusFromTest("results_ready")).toBe("completed");
    expect(t.kitStatusFromTest("weird")).toBeNull();
    expect(t.kitStatusFromOrder({ status: "placed" })).toBe("ordered");
    expect(t.kitStatusFromOrder({ status: "confirmed", label_id: "L1" })).toBe("label_created");
    expect(t.kitStatusFromOrder({ status: "shipped" })).toBe("shipped");
    expect(t.kitStatusFromOrder({ status: "delivered" })).toBe("delivered");
  });

  it("maps shipments", () => {
    expect(t.returnShipmentStatus("processing")).toBe("pending");
    expect(t.returnShipmentStatus("created")).toBe("label_created");
    expect(t.returnShipmentStatus("cancelled")).toBe("voided");
    expect(t.trackingStatus("IT", null)).toBe("in_transit");
    expect(t.trackingStatus("DE", null)).toBe("delivered");
    expect(t.trackingStatus(null, "2026-01-01")).toBe("delivered");
    expect(t.carrierName("FedEx")).toBe("fedex");
  });

  it("maps lab results and the old AI text", () => {
    expect(t.healthStatus("NeedsAttention")).toBe("needs_attention");
    const score = {
      health_status: "Critical",
      detected_pathogens: [{ name: "Giardia", normalized_key: "giardia", cq: "27.5" }],
      non_detected_pathogens: '[{"name":"Salmonella","cq":null}]',
      ai_summary_text: "Giardia was found \u2014 talk to your vet.",
      ai_recommendations: ["Book a vet visit", "Clean the yard"],
      customer_email: "x@y.com",
    };
    expect(t.targetsFromScore(score)).toEqual([
      { labCode: "giardia", name: "Giardia", cq: 27.5, ampStatus: "Amp", call: "detected", wells: [] },
      { labCode: "Salmonella", name: "Salmonella", cq: null, ampStatus: "No Amp", call: "not_detected", wells: [] },
    ]);
    const summary = t.legacySummary(score)!;
    expect(summary.summary).toBe("Giardia was found, talk to your vet.");
    expect(summary.nextSteps).toEqual(["Book a vet visit", "Clean the yard"]);
    expect(summary.vetUrgency).toBe("promptly");
    expect(t.withoutPii(score)).not.toHaveProperty("customer_email");
  });
});
