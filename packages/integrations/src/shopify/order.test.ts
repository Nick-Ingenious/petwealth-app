import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ShopifyPayloadError, normalizeShopifyOrder, toE164 } from "./order";
import { normalizeShopDomain, signShopifyBody, verifyShopifyHmac } from "./verify";

const fixture = readFileSync(new URL("./__fixtures__/orders-paid.json", import.meta.url), "utf8");

describe("verifyShopifyHmac", () => {
  const secret = "test_secret";
  it("accepts a correct signature over the raw body", () => {
    expect(verifyShopifyHmac(fixture, signShopifyBody(fixture, secret), secret)).toBe(true);
  });
  it("rejects tampered bodies, wrong secrets and missing headers", () => {
    const sig = signShopifyBody(fixture, secret);
    expect(verifyShopifyHmac(fixture.replace("364.86", "1.00"), sig, secret)).toBe(false);
    expect(verifyShopifyHmac(fixture, sig, "other")).toBe(false);
    expect(verifyShopifyHmac(fixture, null, secret)).toBe(false);
    expect(verifyShopifyHmac(fixture, "not-base64!!", secret)).toBe(false);
    expect(verifyShopifyHmac(fixture, sig, "")).toBe(false);
  });
  it("normalises shop domains", () => {
    expect(normalizeShopDomain("https://PetWealth.myshopify.com/")).toBe("petwealth.myshopify.com");
  });
});

describe("normalizeShopifyOrder", () => {
  const order = normalizeShopifyOrder(JSON.parse(fixture));

  it("maps money to integer cents", () => {
    expect(order).toMatchObject({ subtotalCents: 37800, discountCents: 3780, taxCents: 2466, totalCents: 36486, shippingCents: 0 });
  });

  it("normalises the customer", () => {
    expect(order.customer).toEqual({
      shopifyCustomerId: "7001234567890",
      email: "jordan.rivera@example.com",
      firstName: "Jordan",
      lastName: "Rivera",
      phone: "+14155550142",
      smsMarketingConsent: true,
    });
  });

  it("keeps the shipping address and line items", () => {
    expect(order.shippingAddress).toMatchObject({ line1: "500 Example Ave", region: "CA", postalCode: "94110" });
    expect(order.lineItems.map((l) => [l.title, l.quantity, l.unitPriceCents, l.variantId])).toEqual([
      ["Cat Complete Health Kit", 1, 27900, "44000000001"],
      ["Dog Fecal Health Kit", 1, 9900, "44000000002"],
    ]);
    expect(order.placedAt.toISOString()).toBe("2026-11-21T15:15:02.000Z");
  });

  it("rejects payloads without an email or line items", () => {
    const bad = JSON.parse(fixture);
    delete bad.email;
    delete bad.contact_email;
    bad.customer.email = null;
    expect(() => normalizeShopifyOrder(bad)).toThrow(ShopifyPayloadError);
    expect(() => normalizeShopifyOrder({ id: 1 })).toThrow(ShopifyPayloadError);
  });
});

describe("toE164", () => {
  it.each([
    ["(415) 555-0142", "+14155550142"],
    ["1-415-555-0142", "+14155550142"],
    ["+44 20 7946 0958", "+442079460958"],
    ["555-0142", null],
    ["", null],
  ])("%s → %s", (input, out) => expect(toE164(input)).toBe(out));
});
