ALTER TABLE "payments" ADD COLUMN "customer_email" text;--> statement-breakpoint
CREATE INDEX "payments_customer_email_idx" ON "payments" USING btree ("customer_email");