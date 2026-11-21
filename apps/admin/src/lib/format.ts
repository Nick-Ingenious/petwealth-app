import { formatCents, kitDisplayName, type Panel, type Species } from "@petwealth/domain";

export { formatCents, kitDisplayName };

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export const formatDate = (d: Date | string | null | undefined) => (d ? dateFmt.format(new Date(d)) : "—");
export const formatDateTime = (d: Date | string | null | undefined) => (d ? dateTimeFmt.format(new Date(d)) : "—");

export function fullName(p: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  return [p?.firstName, p?.lastName].filter(Boolean).join(" ") || "—";
}

export const kitName = (k: { species: Species; panel: Panel }) => kitDisplayName(k.species, k.panel);

/** "4 yrs 8 mo" style age from a YYYY-MM-DD birth date. */
export function petAge(dob: string | null): string {
  if (!dob) return "—";
  const b = new Date(dob);
  const now = new Date();
  let months = (now.getFullYear() - b.getFullYear()) * 12 + now.getMonth() - b.getMonth();
  if (now.getDate() < b.getDate()) months--;
  if (months < 1) return "< 1 month";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${y} yr${y === 1 ? "" : "s"}${m ? ` ${m} mo` : ""}`;
}

export const customerRef = (n: number | null) => (n ? `CUS-${n}` : "—");
export const petRef = (n: number | null) => (n ? `PET-${n}` : "—");
export const orderRef = (n: number | null) => (n ? `PW-${n}` : "—");
