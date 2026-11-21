import { NextResponse, type NextRequest } from "next/server";
import { processShopifyWebhook } from "@petwealth/api";
import { isShopifyTopic, normalizeShopDomain, verifyShopifyHmac } from "@petwealth/integrations/shopify";

/**
 * Shopify webhook receiver — subscribe `orders/paid` and `orders/cancelled`
 * to https://<admin-domain>/api/webhooks/shopify (JSON format).
 *
 * Public (no staff session): authenticity comes from the HMAC signature over
 * the raw body plus the shop-domain check. Responds fast; Shopify retries any
 * non-2xx for up to 48h, and processing is idempotent.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  const expectedShop = normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN);
  if (!secret || !expectedShop) {
    console.error("[shopify] SHOPIFY_WEBHOOK_SECRET / SHOPIFY_SHOP_DOMAIN not configured");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const raw = await req.text();
  if (!verifyShopifyHmac(raw, req.headers.get("x-shopify-hmac-sha256"), secret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }
  const shop = normalizeShopDomain(req.headers.get("x-shopify-shop-domain"));
  if (shop !== expectedShop) {
    console.warn(`[shopify] rejected delivery for unexpected shop ${shop}`);
    return NextResponse.json({ error: "unknown_shop" }, { status: 401 });
  }

  const topic = req.headers.get("x-shopify-topic");
  const webhookId = req.headers.get("x-shopify-webhook-id") ?? req.headers.get("x-shopify-event-id");
  if (!isShopifyTopic(topic)) return NextResponse.json({ ok: true, ignored: `topic ${topic}` });
  if (!webhookId) return NextResponse.json({ error: "missing_webhook_id" }, { status: 400 });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  try {
    const out = await processShopifyWebhook(
      { webhookId, topic, shopDomain: shop, payload },
      {
        acceptTestOrders: process.env.SHOPIFY_ACCEPT_TEST_ORDERS
          ? process.env.SHOPIFY_ACCEPT_TEST_ORDERS === "true"
          : process.env.VERCEL_ENV !== "production",
        smsConsentMode: process.env.SHOPIFY_SMS_CONSENT_MODE === "checkout_phone" ? "checkout_phone" : "marketing_consent",
      },
    );
    // Log ids and outcome only — never customer details.
    console.info(`[shopify] ${topic} ${webhookId} → ${out.outcome}${out.result ? ` (${out.result.status})` : ""}`);
    return NextResponse.json({ ok: true, outcome: out.outcome });
  } catch (e) {
    console.error(`[shopify] ${topic} ${webhookId} failed; Shopify will retry`, e);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
