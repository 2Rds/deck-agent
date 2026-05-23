CREATE TYPE "public"."instrument" AS ENUM('SAFE', 'Priced round', 'Convertible note', 'Not decided yet');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('Pre-seed', 'Seed', 'Series A', 'Bridge / extension', 'Not sure yet');--> statement-breakpoint
CREATE TYPE "public"."target_investors" AS ENUM('Tier 1 VC partners (a16z, Sequoia, etc.)', 'Generalist seed funds', 'Angel investors / scouts', 'Strategic / corporate investors', 'Friends & family', 'Not sure / haven''t decided');--> statement-breakpoint
DROP INDEX "reports_public_token_idx";--> statement-breakpoint
ALTER TABLE "decks" ALTER COLUMN "stage" SET DATA TYPE "public"."stage" USING "stage"::"public"."stage";--> statement-breakpoint
ALTER TABLE "decks" ALTER COLUMN "instrument" SET DATA TYPE "public"."instrument" USING "instrument"::"public"."instrument";--> statement-breakpoint
ALTER TABLE "decks" ALTER COLUMN "target_investors" SET DATA TYPE "public"."target_investors" USING "target_investors"::"public"."target_investors";--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "customer_email" text NOT NULL;--> statement-breakpoint
CREATE INDEX "decks_customer_email_idx" ON "decks" USING btree ("customer_email");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_public_token_idx" ON "reports" USING btree ("public_token") WHERE "reports"."public_token" IS NOT NULL;