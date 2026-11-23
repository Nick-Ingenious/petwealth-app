/**
 * Return-shipping rules shared by the customer portal, admin and API.
 *
 * Customers register one or more tubes together; everything registered in one
 * go ships back in ONE mailer with ONE FedEx code (QR or label) and one RMA.
 */
import { z } from "zod";
import { kitCodeSchema } from "./validators";

/** Mailer capacity, from the customer app: "Up to 10 tubes." */
export const MAX_KITS_PER_MAILER = 10;

/** Days the customer has to drop the mailer off after collecting the sample. */
export const DROP_OFF_WITHIN_DAYS = 6;

/** Customer-facing return authorisation number, e.g. 100172 → "PWR0100172". */
export function formatRma(shipmentNumber: number): string {
  return `PWR${String(shipmentNumber).padStart(7, "0")}`;
}

export const kitRegistrationSchema = z.object({
  kits: z
    .array(z.object({ kitCode: kitCodeSchema, petId: z.uuid("Choose which pet this kit is for") }))
    .min(1, "Scan at least one kit")
    .max(MAX_KITS_PER_MAILER, `A mailer holds up to ${MAX_KITS_PER_MAILER} tubes. Register the rest separately`)
    .refine((kits) => new Set(kits.map((k) => k.kitCode)).size === kits.length, "The same kit was scanned twice"),
});
export type KitRegistration = z.infer<typeof kitRegistrationSchema>;
