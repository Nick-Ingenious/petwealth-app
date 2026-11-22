ALTER TYPE "public"."shipment_status" ADD VALUE 'pending' BEFORE 'label_created';--> statement-breakpoint
ALTER TYPE "public"."shipment_status" ADD VALUE 'failed' BEFORE 'label_created';--> statement-breakpoint
CREATE TABLE "shipment_kits" (
	"shipment_id" uuid NOT NULL,
	"kit_id" uuid NOT NULL,
	CONSTRAINT "shipment_kits_shipment_id_kit_id_pk" PRIMARY KEY("shipment_id","kit_id")
);
--> statement-breakpoint
CREATE TABLE "shipment_labels" (
	"shipment_id" uuid PRIMARY KEY NOT NULL,
	"mime_type" text NOT NULL,
	"content_base64" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_kit_id_kits_id_fk";
--> statement-breakpoint
DROP INDEX "shipments_kit_idx";--> statement-breakpoint
ALTER TABLE "shipments" ALTER COLUMN "kit_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ALTER COLUMN "tracking_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "number" integer NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "shipments_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 100000 CACHE 1);--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "rma_number" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "label_format" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "status_detail" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "picked_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "last_tracked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "legacy_id" text;--> statement-breakpoint
ALTER TABLE "shipment_kits" ADD CONSTRAINT "shipment_kits_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_kits" ADD CONSTRAINT "shipment_kits_kit_id_kits_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."kits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_labels" ADD CONSTRAINT "shipment_labels_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_kits_kit_idx" ON "shipment_kits" USING btree ("kit_id");--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipments_tracking_poll_idx" ON "shipments" USING btree ("status","last_tracked_at");--> statement-breakpoint
CREATE INDEX "shipments_customer_idx" ON "shipments" USING btree ("customer_id");--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_number_unique" UNIQUE("number");--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_rmaNumber_unique" UNIQUE("rma_number");--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_legacyId_unique" UNIQUE("legacy_id");--> statement-breakpoint
-- Backfill: one-kit-per-shipment rows become shipment_kits links.
INSERT INTO "shipment_kits" ("shipment_id", "kit_id")
  SELECT "id", "kit_id" FROM "shipments" WHERE "kit_id" IS NOT NULL
  ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "shipments" s SET "customer_id" = k."customer_id", "order_id" = k."order_id"
  FROM "kits" k WHERE k."id" = s."kit_id";--> statement-breakpoint
UPDATE "shipments" SET "rma_number" = 'PWR' || lpad("number"::text, 7, '0')
  WHERE "direction" = 'return' AND "rma_number" IS NULL;