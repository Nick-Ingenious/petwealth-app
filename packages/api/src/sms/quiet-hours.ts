/**
 * Texts only go out between 9am and 8pm in the customer's local time (US
 * rules discourage texting at night). Local time comes from the state on
 * their default address; with no address we wait until it's 9am to 8pm on
 * both coasts.
 */
export const TEXT_FROM_HOUR = 9;
export const TEXT_UNTIL_HOUR = 20;

const ZONES: Record<string, string[]> = {
  "America/New_York": ["CT", "DC", "DE", "FL", "GA", "IN", "KY", "MA", "MD", "ME", "MI", "NC", "NH", "NJ", "NY", "OH", "PA", "RI", "SC", "VA", "VT", "WV"],
  "America/Chicago": ["AL", "AR", "IA", "IL", "KS", "LA", "MN", "MO", "MS", "ND", "NE", "OK", "SD", "TN", "TX", "WI"],
  "America/Denver": ["CO", "ID", "MT", "NM", "UT", "WY"],
  "America/Phoenix": ["AZ"],
  "America/Los_Angeles": ["CA", "NV", "OR", "WA"],
  "America/Anchorage": ["AK"],
  "Pacific/Honolulu": ["HI"],
  "America/Puerto_Rico": ["PR", "VI"],
};
const ZONE_BY_STATE = new Map(Object.entries(ZONES).flatMap(([zone, states]) => states.map((st) => [st, zone] as const)));

export function timeZoneForState(region: string | null | undefined): string | null {
  return ZONE_BY_STATE.get((region ?? "").trim().toUpperCase()) ?? null;
}

function localHour(zone: string, at: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).format(at));
}

/** True when it's a reasonable hour to text someone in this state. */
export function canTextNow(region: string | null | undefined, at: Date): boolean {
  const zone = timeZoneForState(region);
  const zones = zone ? [zone] : ["America/New_York", "America/Los_Angeles"];
  return zones.every((z) => {
    const h = localHour(z, at);
    return h >= TEXT_FROM_HOUR && h < TEXT_UNTIL_HOUR;
  });
}
