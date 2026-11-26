CREATE TABLE "breed_avatars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"species" "species" NOT NULL,
	"breed" text NOT NULL,
	"mime_type" text NOT NULL,
	"content_base64" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "breed_avatars_species_breed_idx" ON "breed_avatars" USING btree ("species","breed");