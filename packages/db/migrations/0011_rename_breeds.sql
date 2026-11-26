-- The breed picker now uses the old app's breed list. Move the four earlier
-- picker names that differ to the old app's names, so these pets keep a
-- picker breed (and its AI picture).
UPDATE "pets" SET "breed" = 'German Shepherd Dog' WHERE "breed" = 'German Shepherd';--> statement-breakpoint
UPDATE "pets" SET "breed" = 'Poodle (Standard)' WHERE "breed" = 'Poodle';--> statement-breakpoint
UPDATE "pets" SET "breed" = 'Cocker Spaniel (American)' WHERE "breed" = 'Cocker Spaniel';--> statement-breakpoint
UPDATE "pets" SET "breed" = 'American Pit Bull Terrier' WHERE "breed" = 'Pit Bull Terrier';
