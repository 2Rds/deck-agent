-- Enable Row Level Security on all tables.
-- Our app connects as the `postgres` superuser which bypasses RLS,
-- so this is purely defense-in-depth in case anon/service_role keys
-- ever leak and someone hits the PostgREST API directly.
-- Supabase advisor flags tables without RLS as "unrestricted".
ALTER TABLE "decks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
