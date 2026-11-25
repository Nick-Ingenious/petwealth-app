/**
 * Shopify fulfilments → a small provider-neutral shape.
 *
 * Outbound kits are shipped by ShipStation (customers) and Defender (3PL);
 * both write the fulfilment and tracking back to Shopify. We read it from two
 * places with the same result shape:
 * - `fulfillments/create` and `fulfillments/update` webhooks (REST JSON)
 * - the Admin GraphQL API, to backfill orders fulfilled before we listened
 */
import { z } from "zod";
import { ShopifyPayloadError } from "./order";

export type FulfilmentState = "shipped" | "delivered" | "cancelled" | "failed";

export interface NormalizedFulfillment {
  shopifyFulfillmentId: string;
  shopifyOrderId: string;
  /** e.g. "#1042.1" */
  name: string | null;
  state: FulfilmentState;
  /** Lowercase carrier key: fedex, usps, ups, dhl, or the company name as given. */
  carrier: string;
  carrierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  lineItems: { shopifyLineItemId: string; variantId: string | null; sku: string | null; title: string; quantity: number }[];
  occurredAt: Date;
}

const id = z.union([z.number(), z.string()]).transform(String);
const text = z.string().nullish().transform((v) => (v && v.trim() ? v.trim() : null));

/** Numeric id from a GraphQL gid ("gid://shopify/Order/123" → "123"). */
export const fromGid = (gid: string) => gid.slice(gid.lastIndexOf("/") + 1);

export function carrierKey(company: string | null): string {
  const c = (company ?? "").toLowerCase();
  if (!c) return "unknown";
  if (c.includes("fedex")) return "fedex";
  if (c.includes("usps") || c.includes("postal")) return "usps";
  if (/\bups\b/.test(c)) return "ups";
  if (c.includes("dhl")) return "dhl";
  return c.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/**
 * Fulfilment `status` (success / cancelled / error / failure) plus the
 * carrier-driven shipment status (label_printed … delivered / failure).
 */
export function fulfilmentState(status: string | null, shipmentStatus: string | null): FulfilmentState {
  const st = (status ?? "").toLowerCase();
  const sh = (shipmentStatus ?? "").toLowerCase();
  if (st === "cancelled" || st === "canceled") return "cancelled";
  if (st === "error" || st === "failure") return "failed";
  if (sh === "delivered") return "delivered";
  return "shipped";
}

// ── Webhook (REST) ─────────────────────────────────────────────────────

const restSchema = z.object({
  id,
  order_id: id,
  name: text,
  status: text,
  shipment_status: text,
  tracking_company: text,
  tracking_number: text,
  tracking_numbers: z.array(z.string()).nullish(),
  tracking_url: text,
  tracking_urls: z.array(z.string()).nullish(),
  created_at: z.string(),
  updated_at: z.string().nullish(),
  line_items: z
    .array(z.object({ id, variant_id: id.nullish(), sku: text, title: z.string(), quantity: z.number().int().nonnegative() }))
    .default([]),
});

export function normalizeShopifyFulfillment(payload: unknown): NormalizedFulfillment {
  const parsed = restSchema.safeParse(payload);
  if (!parsed.success) throw new ShopifyPayloadError(`Unrecognised Shopify fulfillment payload: ${z.prettifyError(parsed.error)}`);
  const f = parsed.data;
  return {
    shopifyFulfillmentId: f.id,
    shopifyOrderId: f.order_id,
    name: f.name,
    state: fulfilmentState(f.status, f.shipment_status),
    carrier: carrierKey(f.tracking_company),
    carrierName: f.tracking_company,
    trackingNumber: f.tracking_number ?? f.tracking_numbers?.[0] ?? null,
    trackingUrl: f.tracking_url ?? f.tracking_urls?.[0] ?? null,
    lineItems: f.line_items
      .filter((li) => li.quantity > 0)
      .map((li) => ({ shopifyLineItemId: li.id, variantId: li.variant_id ?? null, sku: li.sku, title: li.title, quantity: li.quantity })),
    occurredAt: new Date(f.updated_at ?? f.created_at),
  };
}

// ── Admin GraphQL (backfill) ───────────────────────────────────────────

export const ORDER_FULFILLMENTS_QUERY = /* GraphQL */ `
  query OrderFulfillments($id: ID!) {
    order(id: $id) {
      id
      fulfillments(first: 20) {
        id
        name
        status
        displayStatus
        createdAt
        updatedAt
        trackingInfo(first: 1) { company number url }
        fulfillmentLineItems(first: 50) {
          nodes { quantity lineItem { id sku title variant { id } } }
        }
      }
    }
  }
`;

const gqlFulfillment = z.object({
  id: z.string(),
  name: text,
  status: text,
  displayStatus: text,
  createdAt: z.string(),
  updatedAt: z.string().nullish(),
  trackingInfo: z.array(z.object({ company: text, number: text, url: text })).default([]),
  fulfillmentLineItems: z.object({
    nodes: z.array(
      z.object({
        quantity: z.number().int().nonnegative(),
        lineItem: z.object({ id: z.string(), sku: text, title: z.string(), variant: z.object({ id: z.string() }).nullish() }),
      }),
    ),
  }),
});
const gqlResponse = z.object({
  data: z.object({ order: z.object({ id: z.string(), fulfillments: z.array(gqlFulfillment) }).nullable() }).nullish(),
  errors: z.array(z.object({ message: z.string() })).nullish(),
});

export function normalizeGraphqlFulfillments(json: unknown): NormalizedFulfillment[] {
  const parsed = gqlResponse.safeParse(json);
  if (!parsed.success) throw new ShopifyPayloadError(`Unrecognised Shopify GraphQL response: ${z.prettifyError(parsed.error)}`);
  if (parsed.data.errors?.length) throw new ShopifyPayloadError(parsed.data.errors.map((e) => e.message).join("; "));
  const order = parsed.data.data?.order;
  if (!order) return [];
  return order.fulfillments.map((f) => {
    const t = f.trackingInfo[0];
    // displayStatus mirrors the REST shipment_status in upper case (DELIVERED, IN_TRANSIT, …).
    return {
      shopifyFulfillmentId: fromGid(f.id),
      shopifyOrderId: fromGid(order.id),
      name: f.name,
      state: fulfilmentState(f.status, f.displayStatus),
      carrier: carrierKey(t?.company ?? null),
      carrierName: t?.company ?? null,
      trackingNumber: t?.number ?? null,
      trackingUrl: t?.url ?? null,
      lineItems: f.fulfillmentLineItems.nodes
        .filter((n) => n.quantity > 0)
        .map((n) => ({
          shopifyLineItemId: fromGid(n.lineItem.id),
          variantId: n.lineItem.variant ? fromGid(n.lineItem.variant.id) : null,
          sku: n.lineItem.sku,
          title: n.lineItem.title,
          quantity: n.quantity,
        })),
      occurredAt: new Date(f.updatedAt ?? f.createdAt),
    };
  });
}

/** Admin API version for the backfill. Override with SHOPIFY_API_VERSION if Shopify retires it. */
export const SHOPIFY_API_VERSION = "2026-07";

/**
 * Admin API token for a Dev Dashboard custom app (client credentials grant).
 * Tokens last 24 hours, so callers mint one per run.
 */
export async function getClientCredentialsToken(
  opts: { shopDomain: string; clientId: string; clientSecret: string; fetchImpl?: typeof fetch },
): Promise<string> {
  const res = await (opts.fetchImpl ?? fetch)(`https://${opts.shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: opts.clientId, client_secret: opts.clientSecret }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new ShopifyPayloadError(
      `Shopify didn't issue an Admin API token (${json.error_description ?? json.error ?? res.status}). Check the app's client ID and secret, and that it's installed on the store.`,
    );
  }
  return json.access_token;
}

/** Fetch one order's fulfilments from the Admin GraphQL API. */
export async function fetchOrderFulfillments(
  opts: { shopDomain: string; accessToken: string; apiVersion?: string; fetchImpl?: typeof fetch },
  shopifyOrderId: string,
): Promise<NormalizedFulfillment[]> {
  const res = await (opts.fetchImpl ?? fetch)(`https://${opts.shopDomain}/admin/api/${opts.apiVersion ?? SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": opts.accessToken },
    body: JSON.stringify({ query: ORDER_FULFILLMENTS_QUERY, variables: { id: `gid://shopify/Order/${shopifyOrderId}` } }),
  });
  if (res.status === 401 || res.status === 403) {
    throw new ShopifyPayloadError("Shopify rejected the Admin API token. Check it has the read_orders and read_fulfillments scopes.");
  }
  if (!res.ok) throw new Error(`Shopify Admin API returned ${res.status}`);
  return normalizeGraphqlFulfillments(await res.json());
}
