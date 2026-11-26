import { describe, expect, it, vi } from "vitest";
import { CarrierError, FedExCarrier, TestCarrier, getCarrier, type ReturnShipmentRequest } from "./index";

const req: ReturnShipmentRequest = {
  rmaNumber: "PWR0100001",
  from: { name: "Jordan Rivera", phone: "+14155550142", line1: "500 Example Ave", line2: "Apt 4", city: "San Francisco", region: "CA", postalCode: "94110", country: "US" },
  to: { name: "Sample Receiving", company: "PetWealth Lab", phone: "+15555550100", line1: "1 Lab Way", city: "Austin", region: "TX", postalCode: "78701", country: "US" },
  customerEmail: "Jordan@Example.com",
  kitCount: 2,
  weightLbs: 1,
};

function fakeFetch(responses: Record<string, { status?: number; body: unknown }>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const path = new URL(String(url)).pathname;
    const r = responses[path];
    if (!r) throw new Error(`unexpected ${path}`);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const fedexCfg = { apiKey: "k", secretKey: "s", accountNumber: "740561073", environment: "sandbox" as const, returnServiceType: "FEDEX_GROUND" };

describe("FedExCarrier", () => {
  it("authenticates, builds a return shipment and parses the label", async () => {
    const { fn, calls } = fakeFetch({
      "/oauth/token": { body: { access_token: "tok", expires_in: 3600 } },
      "/ship/v1/shipments": {
        body: { output: { transactionShipments: [{ masterTrackingNumber: "794600000001", pieceResponses: [{ trackingNumber: "794600000001", packageDocuments: [{ encodedLabel: "JVBERi0x", docType: "PDF" }] }] }] } },
      },
    });
    const out = await new FedExCarrier({ ...fedexCfg, fetch: fn }).createReturnShipment(req);
    expect(out).toEqual({ trackingNumber: "794600000001", label: { format: "pdf", mimeType: "application/pdf", contentBase64: "JVBERi0x" } });

    expect(calls[0]!.url).toBe("https://apis-sandbox.fedex.com/oauth/token");
    expect(String(calls[0]!.init.body)).toContain("grant_type=client_credentials");
    const ship = JSON.parse(String(calls[1]!.init.body));
    expect((calls[1]!.init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(ship.requestedShipment.shipper.address.postalCode).toBe("94110"); // customer ships back
    expect(ship.requestedShipment.recipients[0].contact.companyName).toBe("PetWealth Lab");
    expect(ship.requestedShipment.shipmentSpecialServices.specialServiceTypes).toEqual(["RETURN_SHIPMENT"]);
    // FedEx rejects RECIPIENT billing on returns (verified in the sandbox); our account pays as SENDER.
    expect(ship.requestedShipment.shippingChargesPayment.paymentType).toBe("SENDER");
    expect(ship.requestedShipment.requestedPackageLineItems[0].customerReferences[0].value).toBe("PWR0100001");
    expect(ship.requestedShipment.shipper.contact.phoneNumber).toBe("4155550142");
  });

  it("reuses the OAuth token across calls", async () => {
    const { fn, calls } = fakeFetch({
      "/oauth/token": { body: { access_token: "tok", expires_in: 3600 } },
      "/track/v1/trackingnumbers": { body: { output: { completeTrackResults: [] } } },
    });
    const c = new FedExCarrier({ ...fedexCfg, fetch: fn });
    await c.track(["1"]);
    await c.track(["2"]);
    expect(calls.filter((x) => x.url.endsWith("/oauth/token"))).toHaveLength(1);
  });

  it("maps tracking statuses and dates", async () => {
    const { fn } = fakeFetch({
      "/oauth/token": { body: { access_token: "tok", expires_in: 3600 } },
      "/track/v1/trackingnumbers": {
        body: {
          output: {
            completeTrackResults: [
              { trackingNumber: "A", trackResults: [{ latestStatusDetail: { code: "IT", description: "In transit" }, dateAndTimes: [{ type: "ACTUAL_PICKUP", dateTime: "2026-11-20T15:00:00-05:00" }] }] },
              { trackingNumber: "B", trackResults: [{ latestStatusDetail: { code: "DL", description: "Delivered" }, dateAndTimes: [{ type: "ACTUAL_DELIVERY", dateTime: "2026-11-21T10:00:00-05:00" }] }] },
              { trackingNumber: "C", trackResults: [{ error: { code: "TRACKING.TRACKINGNUMBER.NOTFOUND", message: "Not found" } }] },
            ],
          },
        },
      },
    });
    const [a, b, c] = await new FedExCarrier({ ...fedexCfg, fetch: fn }).track(["A", "B", "C"]);
    expect(a).toMatchObject({ status: "in_transit", pickedUpAt: new Date("2026-11-20T20:00:00Z") });
    expect(b).toMatchObject({ status: "delivered", deliveredAt: new Date("2026-11-21T15:00:00Z") });
    expect(c).toMatchObject({ status: "unknown", description: "Not found" });
  });

  it("classifies errors as retryable or not", async () => {
    const bad = fakeFetch({
      "/oauth/token": { body: { access_token: "tok", expires_in: 3600 } },
      "/ship/v1/shipments": { status: 400, body: { errors: [{ code: "SHIPPER.POSTALSTATE.MISMATCH", message: "Invalid postal code" }] } },
    });
    const e1 = await new FedExCarrier({ ...fedexCfg, fetch: bad.fn }).createReturnShipment(req).catch((e) => e);
    expect(e1).toBeInstanceOf(CarrierError);
    expect(e1).toMatchObject({ retryable: false });
    expect(e1.message).toContain("Invalid postal code");

    const down = fakeFetch({ "/oauth/token": { status: 503, body: {} } });
    const e2 = await new FedExCarrier({ ...fedexCfg, fetch: down.fn }).createReturnShipment(req).catch((e) => e);
    expect(e2).toMatchObject({ retryable: true });
  });

});

describe("FedExCarrier QR returns (FedEx Returns API)", () => {
  const returns = { retailerId: 7681814, shipToAddressId: "TXLAB", sku: "7681814_DEFAULT_ITEM" };
  const created = { output: { rma: { rmaId: "7681814-000042", rmaNumber: "PWR0100001", status: "Created", shipments: [{ label: { labelId: 1, trackingNumber: "795798473806" } }] } } };

  it("creates an RMA and returns a QR code of the RMA number", async () => {
    const { fn, calls } = fakeFetch({ "/oauth/token": { body: { access_token: "tok", expires_in: 3600 } }, "/returns/v1/rma": { body: created } });
    const out = await new FedExCarrier({ ...fedexCfg, returns, fetch: fn }).createReturnShipment(req);
    expect(out).toMatchObject({ trackingNumber: "795798473806", carrierReference: "7681814-000042", label: { format: "qr_png", mimeType: "image/png" } });
    expect(Buffer.from(out.label.contentBase64, "base64").subarray(1, 4).toString()).toBe("PNG");

    const headers = calls[1]!.init.headers as Record<string, string>;
    expect(headers["x-authorization"]).toBe("Bearer tok");
    const body = JSON.parse(String(calls[1]!.init.body));
    expect(body).toMatchObject({
      rmaNumber: "PWR0100001",
      shippingService: "FDXE",
      returnProgram: "LABEL",
      labelRequired: true,
      emailNotification: false,
      shippingCostResponsibility: "Retailer",
      shipToAddressId: "TXLAB",
      customer: { id: 7681814, contact: { personName: "Jordan Rivera", emailAddress: "jordan@example.com" } },
      orders: [{ orderNumber: "PWR0100001", items: [{ sku: "7681814_DEFAULT_ITEM", quantity: 2 }] }],
    });
    // The customer's home address is not sent to FedEx Returns.
    expect(JSON.stringify(body)).not.toContain("Example Ave");
  });

  it("treats business errors on HTTP 200 as failures", async () => {
    const { fn } = fakeFetch({
      "/oauth/token": { body: { access_token: "tok", expires_in: 3600 } },
      "/returns/v1/rma": { body: { errors: [{ code: "ERR-RMA-0030", message: "Invalid SKU" }] } },
    });
    const e = await new FedExCarrier({ ...fedexCfg, returns, fetch: fn }).createReturnShipment(req).catch((x) => x);
    expect(e).toBeInstanceOf(CarrierError);
    expect(e).toMatchObject({ retryable: false });
    expect(e.message).toContain("Invalid SKU");
  });

  it("reuses our own RMA when a retry finds it already created", async () => {
    const { fn } = fakeFetch({
      "/oauth/token": { body: { access_token: "tok", expires_in: 3600 } },
      "/returns/v1/rma": { status: 400, body: { errors: [{ code: "ERR-RMA-0011", message: "RMA number already exists" }] } },
      "/returns/v1/rma/details": {
        body: { output: { rmaspg: { content: [{ rmaId: "7681814-000042", rmaNumber: "PWR0100001", retailerId: 7681814, status: "Created", customer: { contact: { emailAddress: "jordan@example.com" } }, shipments: [{ trackingNo: "795798473806" }] }] } } },
      },
    });
    const out = await new FedExCarrier({ ...fedexCfg, returns, fetch: fn }).createReturnShipment(req);
    expect(out.trackingNumber).toBe("795798473806");
  });

  it("refuses an RMA number that belongs to someone else (e.g. the old system)", async () => {
    const { fn } = fakeFetch({
      "/oauth/token": { body: { access_token: "tok", expires_in: 3600 } },
      "/returns/v1/rma": { status: 400, body: { errors: [{ code: "RMA.NUMBER.ALREADY.IN.USE", message: "in use" }] } },
      "/returns/v1/rma/details": {
        body: { output: { rmaspg: { content: [{ rmaNumber: "PWR0100001", retailerId: 7681814, status: "Received", customer: { contact: { emailAddress: "someone@else.com" } }, shipments: [{ trackingNo: "1" }] }] } } },
      },
    });
    await expect(new FedExCarrier({ ...fedexCfg, returns, fetch: fn }).createReturnShipment(req)).rejects.toThrow(/already used in FedEx Returns/);
  });
});

describe("TestCarrier", () => {
  it("creates a scannable QR label and simulates tracking over time", async () => {
    let now = Date.parse("2026-11-22T12:00:00Z");
    const c = new TestCarrier(() => now);
    const created = await c.createReturnShipment(req);
    expect(created.trackingNumber).toMatch(/^TEST\d{19}$/); // 10-digit timestamp + 9 random digits
    expect(created.label.format).toBe("qr_png");
    expect(Buffer.from(created.label.contentBase64, "base64").subarray(1, 4).toString()).toBe("PNG");

    expect((await c.track([created.trackingNumber]))[0]!.status).toBe("label_created");
    now += 11 * 60_000;
    expect((await c.track([created.trackingNumber]))[0]).toMatchObject({ status: "in_transit", deliveredAt: null });
    now += 30 * 60_000;
    expect((await c.track([created.trackingNumber]))[0]!.status).toBe("delivered");
  });
});

describe("getCarrier", () => {
  it("uses FedEx when configured, the test carrier in dev, and refuses fakes in production", () => {
    expect(getCarrier({ FEDEX_API_KEY: "k", FEDEX_SECRET_KEY: "s", FEDEX_ACCOUNT_NUMBER: "1" }).name).toBe("fedex");
  });

  it("requires QR returns in production and complete settings anywhere", () => {
    const keys = { FEDEX_API_KEY: "k", FEDEX_SECRET_KEY: "s", FEDEX_ACCOUNT_NUMBER: "1" };
    expect(() => getCarrier({ ...keys, VERCEL_ENV: "production" })).toThrow(/QR returns are not configured/);
    expect(() => getCarrier({ ...keys, FEDEX_RETAILER_ID: "7681814" })).toThrow(/need all of/);
    expect(() => getCarrier({ ...keys, FEDEX_RETAILER_ID: "abc", FEDEX_RETURN_SHIP_TO_ADDRESS_ID: "TXLAB", FEDEX_RETURN_SKU: "x" })).toThrow(/must be a number/);
  });

  it("trims stray whitespace from pasted FedEx settings", () => {
    const c = getCarrier({
      FEDEX_API_KEY: "\t\nkey123 ",
      FEDEX_SECRET_KEY: " secret\n",
      FEDEX_ACCOUNT_NUMBER: "740561073\n",
      FEDEX_RETURN_SERVICE_TYPE: " FEDEX_2_DAY\n",
    }) as FedExCarrier;
    const cfg = (c as unknown as { cfg: { apiKey: string; secretKey: string; accountNumber: string; returnServiceType: string } }).cfg;
    expect(cfg).toMatchObject({ apiKey: "key123", secretKey: "secret", accountNumber: "740561073", returnServiceType: "FEDEX_2_DAY" });
    expect(getCarrier({ FEDEX_API_KEY: " \n", FEDEX_SECRET_KEY: "s", FEDEX_ACCOUNT_NUMBER: "1" }).name).toBe("test");
  });

  it("uses the FedEx sandbox except in Vercel production", async () => {
    const keys = { FEDEX_API_KEY: "k", FEDEX_SECRET_KEY: "s", FEDEX_ACCOUNT_NUMBER: "1" };
    const urlFor = async (env: Record<string, string>) => {
      const seen: string[] = [];
      const fetch = (async (url: string) => {
        seen.push(new URL(url).host);
        return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
      }) as unknown as typeof globalThis.fetch;
      const c = getCarrier(env) as FedExCarrier;
      (c as unknown as { http: typeof globalThis.fetch }).http = fetch;
      await c.track([]).catch(() => undefined);
      await (c as unknown as { accessToken: () => Promise<string> }).accessToken();
      return seen[0];
    };
    const qr = { FEDEX_RETAILER_ID: "7681814", FEDEX_RETURN_SHIP_TO_ADDRESS_ID: "TXLAB", FEDEX_RETURN_SKU: "7681814_DEFAULT_ITEM" };
    expect(await urlFor({ ...keys, ...qr, VERCEL_ENV: "production" })).toBe("apis.fedex.com");
    expect(await urlFor({ ...keys, VERCEL_ENV: "preview" })).toBe("apis-sandbox.fedex.com");
    expect(await urlFor(keys)).toBe("apis-sandbox.fedex.com");
    expect(getCarrier({}).name).toBe("test");
    expect(() => getCarrier({ VERCEL_ENV: "production" })).toThrow(/FedEx is not configured/);
  });
});
