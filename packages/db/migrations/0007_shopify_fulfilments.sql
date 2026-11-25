ALTER TABLE "order_items" ADD COLUMN "shopify_line_item_id" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "shopify_fulfillment_id" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "tracking_url" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_shopifyFulfillmentId_unique" UNIQUE("shopify_fulfillment_id");