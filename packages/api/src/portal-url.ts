/** The customer portal's base URL (no trailing slash), for links and hosted email images. */
export function portalUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.PORTAL_URL?.trim() || "https://app.petwealth.com").replace(/\/+$/, "");
}
