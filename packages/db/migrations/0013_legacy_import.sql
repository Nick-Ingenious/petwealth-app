ALTER TABLE "addresses" ADD COLUMN "legacy_id" text;--> statement-breakpoint
ALTER TABLE "ai_reports" ADD COLUMN "legacy_id" text;--> statement-breakpoint
ALTER TABLE "lab_results" ADD COLUMN "legacy_id" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "legacy_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "legacy_order_number" text;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "microchip" text;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "vet_notes" text;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "rerun_queue" ADD COLUMN "legacy_id" text;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_legacyId_unique" UNIQUE("legacy_id");--> statement-breakpoint
ALTER TABLE "ai_reports" ADD CONSTRAINT "ai_reports_legacyId_unique" UNIQUE("legacy_id");--> statement-breakpoint
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_legacyId_unique" UNIQUE("legacy_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_legacyId_unique" UNIQUE("legacy_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_legacyOrderNumber_unique" UNIQUE("legacy_order_number");--> statement-breakpoint
ALTER TABLE "rerun_queue" ADD CONSTRAINT "rerun_queue_legacyId_unique" UNIQUE("legacy_id");