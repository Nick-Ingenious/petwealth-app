CREATE TYPE "public"."customer_type" AS ENUM('pet_parent', 'pet_professional');--> statement-breakpoint
CREATE TYPE "public"."pet_sex" AS ENUM('male', 'female', 'unknown');--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "customer_type" "customer_type";--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "sex" "pet_sex";--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "spayed_neutered" boolean;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "weight_lbs" real;