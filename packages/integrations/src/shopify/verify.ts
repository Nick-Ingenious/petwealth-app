import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Shopify webhook signature.
 *
 * Shopify signs the *raw* request body with the app's webhook secret
 * (HMAC-SHA256, base64) and sends it in `X-Shopify-Hmac-Sha256`. The body must
 * be the exact bytes received — never re-serialised JSON.
 */
export function verifyShopifyHmac(rawBody: string | Uint8Array, hmacHeader: string | null, secret: string): boolean {
  if (!hmacHeader || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let received: Buffer;
  try {
    received = Buffer.from(hmacHeader, "base64");
  } catch {
    return false;
  }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Produce a header value as Shopify would (used by tests and the local replay script). */
export function signShopifyBody(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("base64");
}

/** `my-store.myshopify.com` → normalised for comparison. */
export function normalizeShopDomain(domain: string | null | undefined): string {
  return (domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}
