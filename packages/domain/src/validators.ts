/**
 * Input schemas shared by server actions, REST handlers, and MCP tools.
 * Every external input is parsed with one of these before it reaches a service.
 */
import { z } from "zod";
import { SPECIES } from "./catalog";
import { KIT_STATUSES } from "./kit-lifecycle";
import { normalizeKitCode, KIT_CODE_PATTERN } from "./kit-code";
import { ALL_PERMISSIONS, ROLE_KEYS } from "./rbac";

const trimmed = (max: number) => z.string().trim().max(max);

export const kitCodeSchema = z
  .string()
  .transform(normalizeKitCode)
  .pipe(z.string().regex(KIT_CODE_PATTERN, "Not a valid kit ID (expected e.g. FFEC-002-946)"));

export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[^\d+]/g, ""))
  .pipe(z.string().regex(/^\+?\d{10,15}$/, "Enter a valid phone number"));

/**
 * Lenient query-string parsing: junk values fall back to defaults instead of
 * erroring, so a hand-edited URL never 500s. Implemented with `preprocess`
 * (not `.catch`) so the schemas can also generate OpenAPI docs.
 */
const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined), z.string().optional());
const intOr = (fallback: number, ok: (n: number) => boolean) =>
  z.preprocess((v) => {
    const n = Number(v);
    return Number.isInteger(n) && ok(n) ? n : fallback;
  }, z.number().int());
const optionalEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => ((values as readonly unknown[]).includes(v) ? v : undefined), z.enum(values).optional());

export const listQuerySchema = z.object({
  q: optionalText(200),
  page: intOr(1, (n) => n >= 1),
  pageSize: intOr(25, (n) => [10, 25, 50, 100].includes(n)),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const kitListQuerySchema = listQuerySchema.extend({ status: optionalEnum(KIT_STATUSES) });

export const petListQuerySchema = listQuerySchema.extend({ species: optionalEnum(SPECIES) });

export const customerUpdateSchema = z.object({
  firstName: trimmed(80).min(1, "First name is required"),
  lastName: trimmed(80).min(1, "Last name is required"),
  email: z.email("Enter a valid email").trim().toLowerCase(),
  phone: z.union([phoneSchema, z.literal("").transform(() => null)]).nullable(),
  smsOptIn: z.coerce.boolean(),
});
export type CustomerUpdate = z.infer<typeof customerUpdateSchema>;

export const petUpdateSchema = z.object({
  name: trimmed(80).min(1, "Name is required"),
  species: z.enum(SPECIES),
  breed: trimmed(120).nullable().transform((v) => v || null),
  dateOfBirth: z.iso.date().nullable().or(z.literal("").transform(() => null)),
});
export type PetUpdate = z.infer<typeof petUpdateSchema>;

export const receiveKitSchema = z.object({ kitCode: kitCodeSchema });

export const kitTransitionSchema = z.object({
  kitCode: kitCodeSchema,
  to: z.enum(KIT_STATUSES),
  note: trimmed(500).optional(),
});

export const staffInviteSchema = z.object({
  email: z.email().trim().toLowerCase(),
  name: trimmed(120).optional(),
  role: z.enum(ROLE_KEYS),
});

export const rolePermissionsSchema = z.object({
  role: z.enum(ROLE_KEYS).exclude(["super_admin"]),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])),
});
