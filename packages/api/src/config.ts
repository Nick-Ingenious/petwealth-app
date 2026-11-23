import type { Address } from "@petwealth/integrations/carrier";

/**
 * The lab's address for printed return labels (the Ship API fallback). QR
 * returns don't use it — FedEx holds the lab's address under
 * FEDEX_RETURN_SHIP_TO_ADDRESS_ID — and production always uses QR returns, so
 * a placeholder stands in when LAB_SHIP_TO_* isn't set.
 */
export function labAddress(env: Record<string, string | undefined> = process.env): Address {
  const a: Address = {
    name: env.LAB_SHIP_TO_NAME ?? "Sample Receiving",
    company: env.LAB_SHIP_TO_COMPANY ?? "PetWealth Lab",
    phone: env.LAB_SHIP_TO_PHONE ?? "",
    line1: env.LAB_SHIP_TO_LINE1 ?? "",
    line2: env.LAB_SHIP_TO_LINE2 ?? null,
    city: env.LAB_SHIP_TO_CITY ?? "",
    region: env.LAB_SHIP_TO_REGION ?? "",
    postalCode: env.LAB_SHIP_TO_POSTAL_CODE ?? "",
    country: env.LAB_SHIP_TO_COUNTRY ?? "US",
  };
  if (a.line1 && a.city && a.postalCode && a.phone) return a;
  return { ...a, phone: "5555550100", line1: "100 Example Lab Way", city: "Austin", region: "TX", postalCode: "78701" };
}
