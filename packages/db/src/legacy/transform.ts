/**
 * Pure conversion rules from the old app's data to ours (docs/LEGACY_MAPPING.md).
 * No database access here, so every rule can be unit tested.
 */
import { KIT_CODE_PATTERN, type KitStatus, type Panel, type Species, type TargetResult, type TestType } from "@petwealth/domain";

export type Row = Record<string, unknown>;

// ── Small helpers ──────────────────────────────────────────────────────

export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function lowerEmail(v: unknown): string | null {
  const s = str(v)?.toLowerCase() ?? null;
  return s && s.includes("@") ? s : null;
}

/** Dollars (number or numeric string) to integer cents. */
export function cents(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Old `timestamp` columns hold UTC without a zone (the old app appends "Z" when reading).
 * Rows are read with to_jsonb, which renders them as "2026-01-02T03:04:05.123456".
 */
export function utc(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const hasZone = /([zZ]|[+-]\d{2}(:?\d{2})?)$/.test(s) && s.includes("T");
  const d = new Date(hasZone ? s : `${s.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function bool(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  if (v === "true" || v === "t") return true;
  if (v === "false" || v === "f") return false;
  return null;
}

/** jsonb that may arrive as an object, a JSON string, or null. */
export function json<T = unknown>(v: unknown): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  return v as T;
}

// ── People ─────────────────────────────────────────────────────────────

export const STAFF_ROLES = new Set(["SUPER_ADMIN", "MANAGER", "OPS", "CUSTOMER_SUPPORT", "LAB_TECH"]);

export type UserKind = "customer" | "staff" | "skip";

/** Staff aren't migrated (added by hand); placeholder and seed users are skipped. */
export function userKind(u: Row): UserKind {
  const auth0 = str(u.auth0_user_id) ?? "";
  if (auth0 === "deleted-user" || auth0.startsWith("auth0|test_user_")) return "skip";
  if (!lowerEmail(u.email)) return "skip";
  const role = (str(u.role) ?? str(u.customer_type) ?? "").toUpperCase();
  if (STAFF_ROLES.has(role)) return "staff";
  if (str(u.user_type)?.toLowerCase() === "internal") return "staff";
  return "customer";
}

export function customerType(u: Row): "pet_parent" | "pet_professional" | null {
  const role = (str(u.role) ?? str(u.customer_type) ?? "").toUpperCase();
  if (role === "B2B_ADMIN") return "pet_professional";
  if (role === "PET_PARENT") return "pet_parent";
  return null;
}

function activity(u: Row): number {
  return (utc(u.last_login) ?? utc(u.updated_at) ?? utc(u.created_at))?.getTime() ?? 0;
}

export function smsOptIn(u: Row): boolean {
  const pref = json<{ sms?: unknown }>(u.contact_preference);
  return bool(pref?.sms) === true;
}

/**
 * Several old accounts can share one email (Auth0, Google, mobile). They merge
 * into one customer (decision 1): the most recently active account wins, and
 * its blank fields are filled from the others.
 */
export function mergeUsers(group: Row[]): Row {
  const sorted = [...group].sort((a, b) => activity(b) - activity(a));
  const merged: Row = { ...sorted[0]! };
  for (const other of sorted.slice(1)) {
    for (const [k, v] of Object.entries(other)) {
      const empty = merged[k] === null || merged[k] === undefined || merged[k] === "";
      if (empty && v !== null && v !== undefined && v !== "") merged[k] = v;
    }
  }
  merged.contact_preference = { sms: group.some(smsOptIn) };
  merged.is_active = group.some((u) => bool(u.is_active) !== false);
  const created = group.map((u) => utc(u.created_at)).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime());
  merged.created_at = created[0]?.toISOString() ?? null;
  return merged;
}

/** Legacy id for a merged group: the smallest old users.id, stable across runs. */
export function groupLegacyId(group: Row[]): string {
  return String(Math.min(...group.map((u) => Number(u.id))));
}

// ── Addresses ──────────────────────────────────────────────────────────

export interface Address {
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

/** Old address jsonb has several shapes (the old app's utils/addressHelper.js, and Shopify's). */
export function normalizeAddress(v: unknown): Address | null {
  const a = json<Row>(v);
  if (!a || typeof a !== "object" || Array.isArray(a)) return null;
  const pick = (...keys: string[]) => keys.map((k) => str(a[k])).find((x) => x !== null) ?? null;
  const line1 = pick("line1", "address1", "address_line1", "addressLine1", "street", "street1");
  const city = pick("city", "town");
  const region = pick("province_code", "state_code", "state", "region", "province");
  const postalCode = pick("postal_code", "postalCode", "zip", "zipcode", "zip_code");
  if (!line1 || !city || !region || !postalCode) return null;
  const country = (pick("country_code", "countryCode", "country") ?? "US").toUpperCase();
  return {
    line1,
    line2: pick("line2", "address2", "address_line2", "addressLine2", "street2", "apartment"),
    city,
    region,
    postalCode,
    country: country === "UNITED STATES" || country === "USA" ? "US" : country,
  };
}

export function addressKey(a: Address): string {
  return [a.line1, a.line2 ?? "", a.city, a.region, a.postalCode, a.country]
    .map((x) => x.toLowerCase().replace(/\s+/g, " ").trim())
    .join("|");
}

// ── Pets ───────────────────────────────────────────────────────────────

export function petSpecies(p: Row): Species | null {
  for (const raw of [p.species, p.type]) {
    const s = str(raw)?.toLowerCase();
    if (!s) continue;
    if (["dog", "dogs", "canine", "k9", "puppy"].includes(s)) return "dog";
    if (["cat", "cats", "feline", "kitten"].includes(s)) return "cat";
  }
  return null;
}

export function petSex(v: unknown): "male" | "female" | "unknown" {
  const s = str(v)?.toLowerCase();
  if (s === "male" || s === "m") return "male";
  if (s === "female" || s === "f") return "female";
  return "unknown";
}

/** Date of birth, or an approximate one from age in months (decision 5). */
export function petDateOfBirth(p: Row, now = new Date()): string | null {
  const dob = str(p.date_of_birth);
  if (dob) return dob.slice(0, 10);
  const months = Number(p.age_months);
  if (!Number.isFinite(months) || months <= 0 || months > 360) return null;
  const asOf = utc(p.updated_at) ?? utc(p.created_at) ?? now;
  return new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - Math.round(months), 1)).toISOString().slice(0, 10);
}

export function petDeleted(p: Row): boolean {
  return str(p.status)?.toLowerCase() === "deleted" || str(p.deleted_at) !== null;
}

// ── Orders ─────────────────────────────────────────────────────────────

export function orderStatus(v: unknown): "open" | "fulfilled" | "cancelled" {
  const s = str(v)?.toLowerCase() ?? "pending";
  if (s === "shipped" || s === "delivered" || s === "completed" || s === "fulfilled") return "fulfilled";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  return "open";
}

export function orderSource(o: Row): "shopify" | "wholesale" | "legacy" {
  if (str(o.shopify_order_id)) return "shopify";
  const type = str(o.order_type)?.toLowerCase();
  if (type === "standard" || type === "bulk") return "wholesale";
  return "legacy";
}

export interface OrderLine {
  index: number;
  name: string | null;
  sku: string | null;
  species: Species | null;
  testType: TestType | null;
  quantity: number;
  unitPriceCents: number;
}

/** `product_details` is a jsonb[]; read through to_jsonb it's an array of objects (or JSON strings). */
export function orderLines(o: Row): OrderLine[] {
  const raw = json<unknown[]>(o.product_details);
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const p = json<Row>(item) ?? {};
    const text = [p.kit_type, p.name, p.sku].map((x) => str(x) ?? "").join(" ");
    return {
      index,
      name: str(p.name),
      sku: str(p.sku),
      species: speciesFromText(str(p.species) ?? text) ?? speciesFromText(text),
      testType: testTypeFromText(str(p.kit_type) ?? text) ?? testTypeFromText(text),
      quantity: Math.max(1, Math.round(Number(p.quantity) || 1)),
      unitPriceCents: cents(p.unit_price ?? p.price),
    };
  });
}

export function speciesFromText(t: string | null): Species | null {
  const s = (t ?? "").toLowerCase();
  if (/\b(canine|dog|dogs|k9)\b/.test(s) || /\bc(fec|res|ora)\b/.test(s)) return "dog";
  if (/\b(feline|cat|cats)\b/.test(s) || /\bf(fec|res|ora)\b/.test(s)) return "cat";
  return null;
}

export function testTypeFromText(t: string | null): TestType | null {
  const s = (t ?? "").toLowerCase();
  if (/complete|bundle|all\s*3|full panel/.test(s)) return "complete";
  if (/fecal|\bfec\b|stool/.test(s)) return "fecal";
  if (/respiratory|\bres\b|\bresp\b/.test(s)) return "respiratory";
  if (/oral|\bora\b|dental/.test(s)) return "oral";
  return null;
}

// ── Kits ───────────────────────────────────────────────────────────────

const PANEL_BY_CODE: Record<string, Panel> = { FEC: "fecal", RES: "respiratory", ORA: "oral" };

/** Species and panel from a kit code. Old codes may lack the species letter (FEC-001-002). */
export function parseLegacyKitCode(code: string): { species: Species | null; panel: Panel | null; standard: boolean } {
  const c = code.trim().toUpperCase();
  const m = KIT_CODE_PATTERN.exec(c);
  if (m) return { species: m[1] === "C" ? "dog" : "cat", panel: PANEL_BY_CODE[m[2]!]!, standard: true };
  const old = /^([CF])?(FEC|RES|ORA)-/.exec(c);
  return {
    species: old?.[1] === "C" ? "dog" : old?.[1] === "F" ? "cat" : null,
    panel: old ? PANEL_BY_CODE[old[2]!]! : null,
    standard: false,
  };
}

/** Panel from an old kit_type ("Canine Oral Kit") or pet_score kit_type (ORAL). Null for SKIN, LIFESTYLE (decision 3). */
export function panelFromText(t: unknown): Panel | null {
  const s = str(t)?.toLowerCase() ?? "";
  if (/skin|lifestyle/.test(s)) return null;
  const tt = testTypeFromText(s);
  return tt && tt !== "complete" ? tt : null;
}

/** Old tests.status → our kit status. */
export function kitStatusFromTest(v: unknown): KitStatus | null {
  const s = str(v)?.toLowerCase();
  switch (s) {
    case "activated":
    case "assigned":
    case "sample_collected":
    case "in_transit":
    case "received_at_lab":
    case "processing":
    case "completed":
      return s;
    case "sample_packed":
      return "sample_collected";
    case "awaiting_rerun":
      return "rerun";
    case "cancelled":
    case "expired":
      return "cancelled";
    case "finished":
    case "result_ready":
    case "results_ready":
      return "completed";
    case "awaiting":
      return "activated";
    default:
      return null;
  }
}

/** A kit with no tests row (not activated yet): its status follows the order. */
export function kitStatusFromOrder(o: Row | undefined): KitStatus {
  const s = str(o?.status)?.toLowerCase();
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "delivered" || str(o?.delivered_at)) return "delivered";
  if (s === "shipped" || str(o?.shipped_at)) return "shipped";
  if (str(o?.label_id) || str(o?.tracking_number)) return "label_created";
  return "ordered";
}

// ── Shipments ──────────────────────────────────────────────────────────

export type ShipmentStatus = "pending" | "failed" | "label_created" | "in_transit" | "delivered" | "exception" | "voided";

export function returnShipmentStatus(v: unknown): ShipmentStatus {
  const s = str(v)?.toLowerCase();
  if (s === "pending" || s === "processing") return "pending";
  if (s === "created") return "label_created";
  if (s === "in_transit" || s === "delivered" || s === "failed") return s;
  if (s === "cancelled" || s === "canceled") return "voided";
  return "label_created";
}

/** Tracking status on old orders/tests: carrier codes (DE, IT, EX) or words. */
export function trackingStatus(v: unknown, deliveredAt: unknown): ShipmentStatus {
  if (str(deliveredAt)) return "delivered";
  const s = str(v)?.toLowerCase() ?? "";
  if (s === "de" || s.includes("deliver")) return "delivered";
  if (s === "ex" || s.includes("exception") || s.includes("fail")) return "exception";
  if (s === "" || s === "label_created" || s === "pre_transit" || s === "oc") return "label_created";
  return "in_transit";
}

export function carrierName(v: unknown): string {
  const s = str(v)?.toLowerCase() ?? "fedex";
  if (s.includes("fedex") || s === "fdx") return "fedex";
  if (s.includes("ups")) return "ups";
  if (s.includes("usps")) return "usps";
  if (s.includes("dhl")) return "dhl";
  return s;
}

// ── Lab results ────────────────────────────────────────────────────────

export function healthStatus(v: unknown): "clean" | "needs_attention" | "critical" | null {
  const s = str(v)?.toLowerCase().replace(/[\s_-]/g, "");
  if (s === "clean" || s === "healthy") return "clean";
  if (s === "needsattention" || s === "attention") return "needs_attention";
  if (s === "critical") return "critical";
  return null;
}

/** pet_score detected / non-detected pathogen lists → our target results. */
export function targetsFromScore(score: Row): TargetResult[] {
  const read = (v: unknown, call: TargetResult["call"]): TargetResult[] => {
    const list = json<unknown[]>(v);
    if (!Array.isArray(list)) return [];
    return list.flatMap((item): TargetResult[] => {
      const p = json<Row>(item);
      if (!p || typeof p !== "object") return [];
      const name = str(p.name) ?? str(p.display_name) ?? str(p.normalized_key);
      if (!name) return [];
      const cqRaw = str(p.cq ?? p.cq_value);
      const cq = cqRaw === null ? null : Number(cqRaw);
      return [
        {
          labCode: str(p.lab_code) ?? str(p.normalized_key) ?? name,
          name,
          cq: cq !== null && Number.isFinite(cq) ? cq : null,
          ampStatus: call === "detected" ? "Amp" : "No Amp",
          call,
          wells: [],
        },
      ];
    });
  };
  return [...read(score.detected_pathogens, "detected"), ...read(score.non_detected_pathogens, "not_detected")];
}

/** House style: no em or en dashes in customer-facing text. */
function plain(text: string): string {
  return text.replace(/\s*[\u2014\u2013]\s*/g, ", ").trim();
}

function textList(v: unknown): string[] {
  const parsed = json<unknown>(v);
  if (Array.isArray(parsed)) {
    return parsed.flatMap((x) => {
      const o = json<Row>(x);
      const s = typeof x === "string" ? x : (str(o?.text) ?? str(o?.recommendation) ?? str(o?.title));
      return s ? [plain(s)] : [];
    });
  }
  const s = str(v);
  if (!s) return [];
  return s
    .split(/\n+|(?:^|\s)[-*•]\s+|\d+\.\s+/)
    .map((x) => plain(x))
    .filter((x) => x.length > 2);
}

/**
 * The old app's AI text for a result, in the shape our reports use (LabSummary in
 * packages/integrations/src/ai/lab-summary.ts). Null when there's no summary.
 */
export function legacySummary(score: Row): {
  summary: string;
  findings: { name: string; meaning: string }[];
  nextSteps: string[];
  vetUrgency: "routine" | "soon" | "promptly";
  vetReason: string;
} | null {
  const summary = str(score.ai_summary_text) ?? str(score.b2b_report_summary);
  if (!summary) return null;
  const status = healthStatus(score.health_status);
  const steps = [...textList(score.ai_recommendations), ...textList(score.recommendations)];
  return {
    summary: plain(summary),
    findings: [],
    nextSteps: [...new Set(steps)].slice(0, 6),
    vetUrgency: status === "critical" ? "promptly" : status === "needs_attention" ? "soon" : "routine",
    vetReason: plain(textList(score.signs_to_watch_for)[0] ?? ""),
  };
}

/** Personal fields left out of the stored raw copy of an old row. */
const PII_KEYS = new Set(["customer_email", "auth_user_id", "owner_user_id", "email", "phone", "first_name", "last_name", "customer_name"]);

export function withoutPii(r: Row): Row {
  return Object.fromEntries(Object.entries(r).filter(([k]) => !PII_KEYS.has(k)));
}

export function rerunStatus(v: unknown): "active" | "escalated" | "resolved" {
  const s = str(v)?.toLowerCase();
  if (s === "escalated") return "escalated";
  if (s === "resolved" || s === "cancelled") return "resolved";
  return "active";
}

/** Custom photos are copied (decision 7); AI-drawn ones are replaced by our breed avatars. */
export function isCustomPhoto(p: Row): boolean {
  return str(p.photo_url) !== null && str(p.photo_source)?.toLowerCase() !== "ai";
}
