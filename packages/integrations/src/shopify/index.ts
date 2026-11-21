export * from "./order";
export * from "./verify";

/** Webhook topics we subscribe to. Register exactly these in Shopify. */
export const SHOPIFY_TOPICS = ["orders/paid", "orders/cancelled"] as const;
export type ShopifyTopic = (typeof SHOPIFY_TOPICS)[number];
export const isShopifyTopic = (t: string | null): t is ShopifyTopic => (SHOPIFY_TOPICS as readonly string[]).includes(t ?? "");
