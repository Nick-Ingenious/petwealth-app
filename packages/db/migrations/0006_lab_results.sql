CREATE TYPE "public"."lab_result_status" AS ENUM('pending', 'released', 'rerun', 'discarded');--> statement-breakpoint
ALTER TABLE "lab_batches" ADD COLUMN "row_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_batches" ADD COLUMN "run_controls" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_batches" ADD COLUMN "unmatched" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_batches" ADD COLUMN "source_csv" text;--> statement-breakpoint
ALTER TABLE "lab_results" ADD COLUMN "status" "lab_result_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_results" ADD COLUMN "sample" text;--> statement-breakpoint
ALTER TABLE "lab_results" ADD COLUMN "panel_code" text;--> statement-breakpoint
ALTER TABLE "lab_results" ADD COLUMN "targets" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_results" ADD COLUMN "controls" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_results" ADD COLUMN "flags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_results" ADD COLUMN "reviewed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "lab_results" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_reviewed_by_id_staff_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lab_results_batch_idx" ON "lab_results" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "lab_results_status_idx" ON "lab_results" USING btree ("status");