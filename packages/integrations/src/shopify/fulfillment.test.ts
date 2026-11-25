import { describe, expect, it } from "vitest";
import { carrierKey, fulfilmentState, normalizeGraphqlFulfillments, normalizeShopifyFulfillment } from "./fulfillment";
import { ShopifyPayloadError } from "./order";

describe("carrierKey", () => {
  it("normalises common carriers", () => {
    expect(carrierKey("FedEx")).toBe("fedex");
    expect(carrierKey("USPS")).toBe("usps");
    expect(carrierKey("UPS")).toBe("ups");
    expect(carrierKey("DHL eCommerce")).toBe("dhl");
    expect(carrierKey("Other Carrier")).toBe("other_carrier");
    expect(carrierKey(null)).toBe("unknown");
  });
});

describe("fulfilmentState", () => {
  it("reads status and shipment status", () => {
    expect(fulfilmentState("success", null)).toBe("shipped");
    expect(fulfilmentState("success", "in_transit")).toBe("shipped");
    expect(fulfilmentState("success", "delivered")).toBe("delivered");
    expect(fulfilmentState("SUCCESS", "DELIVERED")).toBe("delivered");
    expect(fulfilmentState("cancelled", "delivered")).toBe("cancelled");
    expect(fulfilmentState("failure", null)).toBe("failed");
  });
});

describe("normalizeShopifyFulfillment (webhook)", () => {
  it("maps the REST payload", () => {
    const f = normalizeShopifyFulfillment({
      id: 5551,
      order_id: 4441,
      name: "#1042.1",
      status: "success",
      shipment_status: "delivered",
      tracking_company: "USPS",
      tracking_number: null,
      tracking_numbers: ["9400100000000000000000"],
      tracking_url: null,
      tracking_urls: ["https://tools.usps.com/x"],
      created_at: "2026-11-20T15:00:00-05:00",
      updated_at: "2026-11-22T10:00:00-05:00",
      line_items: [
        { id: 14001, variant_id: 44000000001, sku: "PW-CAT-COMPLETE", title: "Cat Complete Health Kit", quantity: 1 },
        { id: 14003, variant_id: null, sku: null, title: "Gift note", quantity: 0 },
      ],
    });
    expect(f).toMatchObject({
      shopifyFulfillmentId: "5551",
      shopifyOrderId: "4441",
      state: "delivered",
      carrier: "usps",
      trackingNumber: "9400100000000000000000",
      trackingUrl: "https://tools.usps.com/x",
    });
    expect(f.lineItems).toEqual([
      { shopifyLineItemId: "14001", variantId: "44000000001", sku: "PW-CAT-COMPLETE", title: "Cat Complete Health Kit", quantity: 1 },
    ]);
    expect(f.occurredAt.toISOString()).toBe("2026-11-22T15:00:00.000Z");
  });

  it("rejects payloads without an order", () => {
    expect(() => normalizeShopifyFulfillment({ id: 1 })).toThrow(ShopifyPayloadError);
  });
});

describe("normalizeGraphqlFulfillments (backfill)", () => {
  it("maps the Admin API response", () => {
    const [f] = normalizeGraphqlFulfillments({
      data: {
        order: {
          id: "gid://shopify/Order/4441",
          fulfillments: [
            {
              id: "gid://shopify/Fulfillment/5551",
              name: "#1042.1",
              status: "SUCCESS",
              displayStatus: "IN_TRANSIT",
              createdAt: "2026-11-20T20:00:00Z",
              updatedAt: null,
              trackingInfo: [{ company: "FedEx", number: "771234567890", url: "https://fedex.com/x" }],
              fulfillmentLineItems: {
                nodes: [
                  {
                    quantity: 2,
                    lineItem: { id: "gid://shopify/LineItem/14002", sku: "PW-DOG-FECAL", title: "Dog Fecal Health Kit", variant: { id: "gid://shopify/ProductVariant/44000000002" } },
                  },
                ],
              },
            },
          ],
        },
      },
    });
    expect(f).toMatchObject({ shopifyFulfillmentId: "5551", shopifyOrderId: "4441", state: "shipped", carrier: "fedex", trackingNumber: "771234567890" });
    expect(f!.lineItems).toEqual([{ shopifyLineItemId: "14002", variantId: "44000000002", sku: "PW-DOG-FECAL", title: "Dog Fecal Health Kit", quantity: 2 }]);
  });

  it("surfaces GraphQL errors", () => {
    expect(() => normalizeGraphqlFulfillments({ errors: [{ message: "Access denied for fulfillments field." }] })).toThrow(/Access denied/);
  });
});
