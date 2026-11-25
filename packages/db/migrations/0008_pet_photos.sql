CREATE TABLE "pet_photos" (
	"pet_id" uuid PRIMARY KEY NOT NULL,
	"mime_type" text NOT NULL,
	"content_base64" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pet_photos" ADD CONSTRAINT "pet_photos_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;