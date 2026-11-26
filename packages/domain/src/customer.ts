/**
 * Customer-portal inputs: account setup ("Step 1 of 2") and Add Pet.
 * Mirrors the fields in the existing customer app.
 */
import { z } from "zod";
import { SPECIES, type Species } from "./catalog";
import { phoneSchema } from "./validators";

export const CUSTOMER_TYPES = ["pet_parent", "pet_professional"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export const CUSTOMER_TYPE_LABEL: Record<CustomerType, string> = { pet_parent: "Pet Parent", pet_professional: "Pet Professional" };

export const PET_SEXES = ["male", "female"] as const;

const name = (label: string) => z.string().trim().min(1, `${label} is required`).max(80);
const checkbox = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());

export const addressSchema = z.object({
  line1: z.string().trim().min(1, "Street address is required").max(120),
  line2: z.string().trim().max(120).optional().transform((v) => v || null),
  city: z.string().trim().min(1, "City is required").max(80),
  region: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use the 2-letter state code, e.g. CA"),
  postalCode: z.string().trim().regex(/^\d{5}(-\d{4})?$/, "Enter a 5-digit ZIP code"),
});

export const onboardingSchema = z.object({
  firstName: name("First name"),
  lastName: name("Last name"),
  phone: phoneSchema,
  customerType: z.enum(CUSTOMER_TYPES, "Choose Pet Parent or Pet Professional"),
  /** Explicit, unticked-by-default consent for kit and result texts. */
  smsOptIn: checkbox,
  /** Required only when we don't already have a shipping address (e.g. from Shopify). */
  address: addressSchema.optional(),
});
export type Onboarding = z.infer<typeof onboardingSchema>;

export const petCreateSchema = z.object({
  name: name("Name"),
  species: z.enum(SPECIES, "Choose dog or cat"),
  dateOfBirth: z.iso
    .date("Enter a birthday")
    .refine((d) => new Date(`${d}T00:00:00Z`).getTime() <= Date.now(), "Birthday can't be in the future")
    .refine((d) => new Date(`${d}T00:00:00Z`).getFullYear() >= 1990, "Check the birthday year"),
  weightLbs: z.coerce.number("Enter a weight").positive("Enter a weight").max(300, "Check the weight"),
  breed: z.string().trim().min(1, "Choose a breed").max(120),
  sex: z.enum(PET_SEXES, "Choose male or female"),
  spayedNeutered: z.preprocess((v) => (v === "yes" ? true : v === "no" ? false : v), z.boolean("Choose yes or no")),
});
export type PetCreate = z.infer<typeof petCreateSchema>;

/** My Information: name, phone, text alerts and shipping address. Email belongs to the login. */
export const profileUpdateSchema = z.object({
  firstName: name("First name"),
  lastName: name("Last name"),
  phone: phoneSchema,
  smsOptIn: checkbox,
  address: addressSchema,
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

/** Pet photos arrive already resized in the browser (about 600px JPEG). */
export const PET_PHOTO_MAX_BYTES = 750_000;
export const petPhotoSchema = z
  .string()
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Choose a JPEG, PNG or WebP photo")
  .refine((v) => (v.length - v.indexOf(",") - 1) * 0.75 <= PET_PHOTO_MAX_BYTES, "That photo is too large. Try a smaller one.");

