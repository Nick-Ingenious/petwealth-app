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

/** Common breeds for the picker; free text is still accepted ("Other"). */
export const BREEDS: Record<Species, string[]> = {
  dog: [
    "Mixed breed", "Australian Shepherd", "Beagle", "Bernese Mountain Dog", "Border Collie", "Boston Terrier", "Boxer",
    "Bulldog", "Cavalier King Charles Spaniel", "Chihuahua", "Cocker Spaniel", "Dachshund", "Doberman Pinscher",
    "French Bulldog", "German Shepherd", "Golden Retriever", "Goldendoodle", "Great Dane", "Havanese",
    "Labrador Retriever", "Labradoodle", "Maltese", "Miniature Schnauzer", "Pembroke Welsh Corgi", "Pit Bull Terrier",
    "Pomeranian", "Poodle", "Pug", "Rottweiler", "Shih Tzu", "Siberian Husky", "Shiba Inu", "Yorkshire Terrier", "Other",
  ],
  cat: [
    "Domestic Shorthair", "Domestic Mediumhair", "Domestic Longhair", "Abyssinian", "American Bobtail",
    "American Shorthair", "Bengal", "Birman", "British Shorthair", "Burmese", "Devon Rex", "Maine Coon",
    "Norwegian Forest Cat", "Persian", "Ragdoll", "Russian Blue", "Scottish Fold", "Siamese", "Sphynx", "Other",
  ],
};
