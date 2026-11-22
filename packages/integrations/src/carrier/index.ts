import { FedExCarrier } from "./fedex";
import { TestCarrier } from "./test-carrier";
import type { Carrier } from "./types";

export * from "./fedex";
export * from "./test-carrier";
export * from "./types";

/**
 * The carrier for this environment:
 * - FedEx when FEDEX_API_KEY / FEDEX_SECRET_KEY / FEDEX_ACCOUNT_NUMBER are set;
 * - otherwise the TestCarrier — but never in Vercel production, where a missing
 *   FedEx config is an error rather than silently fake labels.
 */
export function getCarrier(env: Record<string, string | undefined> = process.env): Carrier {
  const { FEDEX_API_KEY, FEDEX_SECRET_KEY, FEDEX_ACCOUNT_NUMBER } = env;
  if (FEDEX_API_KEY && FEDEX_SECRET_KEY && FEDEX_ACCOUNT_NUMBER) {
    return new FedExCarrier({
      apiKey: FEDEX_API_KEY,
      secretKey: FEDEX_SECRET_KEY,
      accountNumber: FEDEX_ACCOUNT_NUMBER,
      environment: env.FEDEX_ENV === "production" ? "production" : "sandbox",
      returnServiceType: env.FEDEX_RETURN_SERVICE_TYPE || "FEDEX_GROUND",
      returnLabelMode: env.FEDEX_RETURN_LABEL_MODE === "qr" ? "qr" : "label",
    });
  }
  if (env.VERCEL_ENV === "production") {
    throw new Error("FedEx is not configured (FEDEX_API_KEY, FEDEX_SECRET_KEY, FEDEX_ACCOUNT_NUMBER).");
  }
  return new TestCarrier();
}
