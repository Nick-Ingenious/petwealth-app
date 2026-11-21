/**
 * Shopify REST webhook payloads (orders/paid, orders/cancelled) → a small,
 * validated, provider-neutral shape. Only fields we use are parsed; everything
 * else is ignored, so Shopify adding fields never breaks ingestion.
 */
import { z } from "zod";

const id = z.union([z.number(), z.string()]).transform(String);
const money = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`Invalid money amount: ${v}`);
    return Math.round(n * 100);
  });
const text = z.string().nullish().transform((v) => (v && v.trim() ? v.trim() : null));
const moneySet = z.object({ shop_money: z.object({ amount: money }) }).nullish();

const addressSchema = z
  .object({
    first_name: text,
    last_name: text,
    address1: text,
    address2: text,
    city: text,
    province_code: text,
    province: text,
    zip: text,
    country_code: text,
    phone: text,
  })
  .nullish();

export const shopifyOrderPayloadSchema = z.object({
  id,
  name: z.string(),
  email: text,
  contact_email: text,
  phone: text,
  created_at: z.string(),
  processed_at: z.string().nullish(),
  cancelled_at: z.string().nullish(),
  cancel_reason: text,
  financial_status: text,
  test: z.boolean().nullish(),
  currency: z.string().default("USD"),
  subtotal_price: money,
  total_discounts: money,
  total_tax: money,
  total_price: money,
  total_shipping_price_set: moneySet,
  customer: z
    .object({
      id,
      email: text,
      first_name: text,
      last_name: text,
      phone: text,
      sms_marketing_consent: z.object({ state: z.string().nullish() }).nullish(),
    })
    .nullish(),
  shipping_address: addressSchema,
  billing_address: addressSchema,
  line_items: z.array(
    z.object({
      id,
      variant_id: id.nullish(),
      product_id: id.nullish(),
      sku: text,
      title: z.string(),
      variant_title: text,
      quantity: z.number().int().positive(),
      price: money,
      requires_shipping: z.boolean().nullish(),
    }),
  ),
});
export type ShopifyOrderPayload = z.infer<typeof shopifyOrderPayloadSchema>;

export interface NormalizedOrder {
  shopifyOrderId: string;
  name: string;
  placedAt: Date;
  isTest: boolean;
  financialStatus: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  customer: {
    shopifyCustomerId: string | null;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    smsMarketingConsent: boolean;
  };
  shippingAddress: {
    line1: string;
    line2: string | null;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  } | null;
  lineItems: {
    shopifyLineItemId: string;
    variantId: string | null;
    productId: string | null;
    sku: string | null;
    title: string;
    quantity: number;
    unitPriceCents: number;
    requiresShipping: boolean;
  }[];
}

/** US-centric E.164 normalisation; returns null for anything we can't text. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^\+\d{10,15}$/.test(digits)) return digits;
  const d = digits.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

export class ShopifyPayloadError extends Error {
  override name = "ShopifyPayloadError";
}

export function normalizeShopifyOrder(payload: unknown): NormalizedOrder {
  const parsed = shopifyOrderPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ShopifyPayloadError(`Unrecognised Shopify order payload: ${z.prettifyError(parsed.error)}`);
  }
  const o = parsed.data;
  const email = (o.email ?? o.contact_email ?? o.customer?.email)?.toLowerCase();
  if (!email) throw new ShopifyPayloadError(`Order ${o.name} has no customer email.`);
  const ship = o.shipping_address;

  return {
    shopifyOrderId: o.id,
    name: o.name,
    placedAt: new Date(o.processed_at ?? o.created_at),
    isTest: Boolean(o.test),
    financialStatus: o.financial_status,
    cancelledAt: o.cancelled_at ? new Date(o.cancelled_at) : null,
    cancelReason: o.cancel_reason,
    currency: o.currency,
    subtotalCents: o.subtotal_price,
    discountCents: o.total_discounts,
    shippingCents: o.total_shipping_price_set?.shop_money.amount ?? 0,
    taxCents: o.total_tax,
    totalCents: o.total_price,
    customer: {
      shopifyCustomerId: o.customer?.id ?? null,
      email,
      firstName: o.customer?.first_name ?? ship?.first_name ?? o.billing_address?.first_name ?? null,
      lastName: o.customer?.last_name ?? ship?.last_name ?? o.billing_address?.last_name ?? null,
      phone: toE164(o.customer?.phone ?? o.phone ?? ship?.phone ?? o.billing_address?.phone),
      smsMarketingConsent: o.customer?.sms_marketing_consent?.state === "subscribed",
    },
    shippingAddress:
      ship?.address1 && ship.city && ship.zip
        ? {
            line1: ship.address1,
            line2: ship.address2,
            city: ship.city,
            region: ship.province_code ?? ship.province ?? "",
            postalCode: ship.zip,
            country: ship.country_code ?? "US",
          }
        : null,
    lineItems: o.line_items.map((li) => ({
      shopifyLineItemId: li.id,
      variantId: li.variant_id ?? null,
      productId: li.product_id ?? null,
      sku: li.sku,
      title: li.title,
      quantity: li.quantity,
      unitPriceCents: li.price,
      requiresShipping: li.requires_shipping ?? true,
    })),
  };
}
