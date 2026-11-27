ALTER TABLE "lab_batches" ADD COLUMN "held" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_batches" ADD COLUMN "cleanup" jsonb;--> statement-breakpoint
ALTER TABLE "lab_batches" ADD COLUMN "ai_review" jsonb;