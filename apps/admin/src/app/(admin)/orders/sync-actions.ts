"use server";

import { revalidatePath } from "next/cache";
import { backfillShopifyFulfillments } from "@petwealth/api";
import { normalizeShopDomain } from "@petwealth/integrations/shopify";
import { runAction, type ActionResult } from "@/lib/action";

export type SyncResult = ActionResult<{ checked: number; fulfilments: number; kitsShipped: number; kitsDelivered: number; remaining: number; errors: string[] }>;

/** Pull fulfilments (tracking) from Shopify for orders that still have kits waiting to ship. */
export async function syncShopifyShippingAction(): Promise<SyncResult> {
  const result = await runAction((staff) =>
    backfillShopifyFulfillments(staff, {
      shopDomain: normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN),
      clientId: process.env.SHOPIFY_CLIENT_ID,
      clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
      accessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
      apiVersion: process.env.SHOPIFY_API_VERSION || undefined,
    }),
  );
  if (result.ok) revalidatePath("/orders");
  return result;
}
