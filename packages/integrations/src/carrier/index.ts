import { FedExCarrier, type FedExReturnsConfig } from "./fedex";
import { TestCarrier } from "./test-carrier";
import type { Carrier } from "./types";

export * from "./fedex";
export * from "./test-carrier";
export * from "./types";

/**
 * The carrier for this environment:
 * - FedEx when FEDEX_API_KEY / FEDEX_SECRET_KEY / FEDEX_ACCOUNT_NUMBER are set.
 *   With FEDEX_RETAILER_ID / FEDEX_RETURN_SHIP_TO_ADDRESS_ID / FEDEX_RETURN_SKU
 *   it makes label-less QR returns; without them, printed PDF return labels.
 * - otherwise the TestCarrier.
 * Vercel production requires FedEx with QR returns: a missing setting is an
 * error there, never fake codes or a silent switch to printed labels.
 */
export function getCarrier(env: Record<string, string | undefined> = process.env): Carrier {
  const production = env.VERCEL_ENV === "production";
  // Trimmed: a key pasted into Vercel with a stray tab or line break fails
  // FedEx OAuth with a misleading "credentials not valid".
  const FEDEX_API_KEY = env.FEDEX_API_KEY?.trim();
  const FEDEX_SECRET_KEY = env.FEDEX_SECRET_KEY?.trim();
  const FEDEX_ACCOUNT_NUMBER = env.FEDEX_ACCOUNT_NUMBER?.trim();
  if (FEDEX_API_KEY && FEDEX_SECRET_KEY && FEDEX_ACCOUNT_NUMBER) {
    const returns = returnsConfig(env);
    if (production && !returns) {
      throw new Error("FedEx QR returns are not configured (FEDEX_RETAILER_ID, FEDEX_RETURN_SHIP_TO_ADDRESS_ID, FEDEX_RETURN_SKU).");
    }
    return new FedExCarrier({
      apiKey: FEDEX_API_KEY,
      secretKey: FEDEX_SECRET_KEY,
      accountNumber: FEDEX_ACCOUNT_NUMBER,
      // Vercel Production talks to FedEx production; previews and local dev use the
      // sandbox. Scope the production keys to Production and the test keys to
      // Preview + Development, and the right pair always meets the right server.
      environment: production ? "production" : "sandbox",
      returnServiceType: env.FEDEX_RETURN_SERVICE_TYPE?.trim() || "FEDEX_GROUND",
      returns,
    });
  }
  if (production) {
    throw new Error("FedEx is not configured (FEDEX_API_KEY, FEDEX_SECRET_KEY, FEDEX_ACCOUNT_NUMBER).");
  }
  return new TestCarrier();
}

function returnsConfig(env: Record<string, string | undefined>): FedExReturnsConfig | undefined {
  const retailer = env.FEDEX_RETAILER_ID?.trim();
  const shipToAddressId = env.FEDEX_RETURN_SHIP_TO_ADDRESS_ID?.trim();
  const sku = env.FEDEX_RETURN_SKU?.trim();
  if (!retailer && !shipToAddressId && !sku) return undefined;
  if (!retailer || !shipToAddressId || !sku) {
    throw new Error("FedEx QR returns need all of FEDEX_RETAILER_ID, FEDEX_RETURN_SHIP_TO_ADDRESS_ID and FEDEX_RETURN_SKU.");
  }
  if (!/^\d+$/.test(retailer)) throw new Error("FEDEX_RETAILER_ID must be a number.");
  return { retailerId: Number(retailer), shipToAddressId, sku };
}
