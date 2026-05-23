CREATE TYPE "public"."deck_status" AS ENUM('uploaded', 'processing', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'used', 'refunded');--> statement-breakpoint
CREATE TABLE "decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stripe_session_id" text NOT NULL,
	"r2_pdf_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"file_size" integer NOT NULL,
	"slide_count" integer,
	"stage" text NOT NULL,
	"round_amount_normalized" text NOT NULL,
	"instrument" text NOT NULL,
	"target_investors" text,
	"traction_oneline" text,
	"biggest_worry" text,
	"additional_context" text,
	"status" "deck_status" DEFAULT 'uploaded' NOT NULL,
	"pipeline_progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"failure_reason" text
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stripe_session_id" text NOT NULL,
	"stripe_payment_intent_id" text,
	"amount_cents" bigint NOT NULL,
	"intro_pricing" boolean NOT NULL,
	"deck_id" uuid,
	"status" "payment_status" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pass_1_output" jsonb,
	"pass_2_output" jsonb,
	"pass_3_output" jsonb,
	"pass_4_output" jsonb,
	"pass_5_output" jsonb,
	"pass_6_output" jsonb,
	"private_token" text NOT NULL,
	"public_token" text,
	"is_public" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decks_status_idx" ON "decks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "decks_created_at_idx" ON "decks" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_stripe_session_id_idx" ON "payments" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_deck_id_unique" ON "reports" USING btree ("deck_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_private_token_idx" ON "reports" USING btree ("private_token");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_public_token_idx" ON "reports" USING btree ("public_token");