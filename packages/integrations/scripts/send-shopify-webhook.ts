/**
 * Send a correctly signed Shopify webhook to a running admin app — for local
 * development and for testing a preview deployment end to end.
 *
 *   pnpm --filter @petwealth/integrations shopify:send            # orders/paid, sample order
 *   pnpm --filter @petwealth/integrations shopify:send -- --topic orders/cancelled --id 123 --again
 *
 * Options: --url (default http://localhost:3001), --topic, --file (JSON payload),
 * --id (Shopify order id; default random), --again (reuse the last webhook id).
 * Reads SHOPIFY_WEBHOOK_SECRET and SHOPIFY_SHOP_DOMAIN from the root .env.
 */
import { randomInt, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { signShopifyBody } from "../src/shopify/verify";

if (existsSync(new URL("../../../.env", import.meta.url))) process.loadEnvFile(new URL("../../../.env", import.meta.url));

const { values } = parseArgs({
  // pnpm forwards a literal "--" separator; drop it.
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    url: { type: "string", default: "http://localhost:3001" },
    topic: { type: "string", default: "orders/paid" },
    file: { type: "string" },
    id: { type: "string" },
    again: { type: "boolean", default: false },
  },
});

const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
const shop = process.env.SHOPIFY_SHOP_DOMAIN;
if (!secret || !shop) throw new Error("Set SHOPIFY_WEBHOOK_SECRET and SHOPIFY_SHOP_DOMAIN in .env");

const payload = JSON.parse(readFileSync(values.file ?? new URL("../src/shopify/__fixtures__/orders-paid.json", import.meta.url), "utf8"));
payload.id = values.id ? Number(values.id) : 9_100_000_000_000 + randomInt(1e9);
payload.name = `#DEV${String(payload.id).slice(-5)}`;
if (values.topic === "orders/cancelled") Object.assign(payload, { cancelled_at: new Date().toISOString(), cancel_reason: "customer" });

const lastIdFile = join(tmpdir(), "petwealth-last-shopify-webhook-id");
const webhookId = values.again && existsSync(lastIdFile) ? readFileSync(lastIdFile, "utf8") : randomUUID();
writeFileSync(lastIdFile, webhookId);

const body = JSON.stringify(payload);
const res = await fetch(new URL("/api/webhooks/shopify", values.url), {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-shopify-topic": values.topic!,
    "x-shopify-shop-domain": shop,
    "x-shopify-webhook-id": webhookId,
    "x-shopify-hmac-sha256": signShopifyBody(body, secret),
  },
  body,
});
console.log(`${values.topic} order ${payload.id} (${payload.name}) webhook ${webhookId} → ${res.status} ${await res.text()}`);
