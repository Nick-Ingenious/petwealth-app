import type { Address } from "@petwealth/integrations/carrier";

/**
 * Where return mailers go. Set LAB_SHIP_TO_* in Vercel; a placeholder is used
 * outside production so development works without it.
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
  if (env.VERCEL_ENV === "production") throw new Error("Lab return address is not configured (LAB_SHIP_TO_*).");
  return { ...a, phone: "5555550100", line1: "100 Example Lab Way", city: "Austin", region: "TX", postalCode: "78701" };
}
