# DeckRedTeam — Build Package

This package contains everything needed to build DeckRedTeam, an automated pitch deck red team service. Hand this entire folder to Claude Code as the starting point.

## What's Here

```
deckredteam/
├── SPEC.md                    # Full build specification — read this first
├── prompts/
│   ├── README.md              # Rules for working with prompt files
│   ├── pass-1.md              # Per-slide extraction
│   ├── pass-2.md              # Math + consistency audit (the moat)
│   ├── pass-3.md              # Investor objections
│   ├── pass-4.md              # Structural audit
│   ├── pass-5.md              # Specific rewrites
│   └── pass-6.md              # Anxiety-targeted addendum
└── schemas/
    ├── README.md              # Rules for working with schema files
    ├── pass-1-output.ts       # Per-slide extraction schema
    ├── deck-extraction.ts     # Assembled Pass 1 output
    ├── pass-2-output.ts       # Math audit schema
    ├── pass-3-output.ts       # Objections schema
    ├── pass-4-output.ts       # Structural audit schema
    ├── pass-5-output.ts       # Rewrites schema
    ├── pass-6-output.ts       # Anxiety addendum schema
    └── questionnaire.ts       # Form data schema
```

## Three Rules for Claude Code

1. **`/prompts/*.md` are source-of-truth.** Do not rewrite or "improve" them. Substitute `{{variables}}` and send as-is.

2. **`/schemas/*.ts` are source-of-truth.** Use them for runtime validation. Do not change field names, types, or structure.

3. **The "What's NOT in v1" section of SPEC.md is binding.** Do not build features listed there.

## Suggested Build Order

1. Read SPEC.md fully before writing any code.
2. Read prompts/README.md and all six prompt files to understand the pipeline.
3. Read schemas/README.md and the schema files.
4. Set up the repo structure (monorepo with apps/web and apps/worker, packages/prompts, packages/schemas, packages/db).
5. Set up infrastructure (Vercel, Cloudflare Worker, Postgres, R2, Stripe, Resend, CloudConvert).
6. Build the data layer (Postgres schema, R2 client, Stripe client).
7. Build the landing page (static, minimal).
8. Build the Stripe webhook handler.
9. Build the upload + questionnaire page (post-payment).
10. Build the Worker pipeline (Stage 0 through Stage 4).
11. Build the processing page (polling-based progress UI).
12. Build the report rendering.
13. Build the email delivery.
14. Test against the 3 test decks specified in SPEC.md Section 10.
15. Deploy and run the launch checklist.

## Stack Decisions (Finalized May 2026)

- **Web framework:** Next.js (App Router) on Vercel
- **Pipeline runtime:** Inngest on Vercel (durable steps, parallel DAG, retries as config) — replaces SPEC.md's original "Cloudflare Worker"
- **Database:** Supabase Postgres (direct `postgres-js` connection; Auth/Storage/Edge Functions not used)
- **File storage:** Cloudflare R2 (PDFs only — no rendered slide images stored)
- **Payment:** Stripe Checkout (hosted)
- **Email:** Resend
- **File format:** PDF only. PPTX cut from v1 (export-to-PDF instructions on landing/upload pages)
- **Slide ingestion:** PDF sent directly to Anthropic via `document` content block — skips the PDF→PNG conversion step the original spec assumed
- **AI model:** `claude-sonnet-4-6` for all six passes (Anthropic Tier 2)
- **Error monitoring:** Sentry (web + Inngest function)
- **Validation:** Zod runtime validation against `/schemas/*.ts`

CloudConvert is **not** used in v1. May be re-added in v1.1 if PPTX demand materializes.

## Stack Decisions Left Open

- DB query layer (Drizzle vs raw SQL — leaning Drizzle for type safety with Zod-inferred types)
- CSS approach (Tailwind recommended given operator's existing stack)
- Specific PDF page-slicing approach (`pdf-lib` vs `pdfjs-dist` — pick at implementation time)

## Deviations from Original SPEC

These changes were made after rule-1 and rule-2 source-of-truth constraints were relaxed by the operator. Each deviation is documented here and in commit messages.

1. **Cloudflare Worker → Inngest on Vercel.** Durable retries, parallel step DAG, single deploy target. Removes a deploy and an auth boundary.
2. **PDF or PPTX → PDF only.** Removes CloudConvert from the critical path entirely. Lost customer estimate <10%, all of whom can export-to-PDF in 5 seconds. Landing page includes export instructions for PowerPoint/Keynote/Google Slides.
3. **PDF→PNG conversion → Claude `document` block.** Anthropic renders each PDF page server-side. Saves 15-30s wall-clock per deck and removes a failure mode. Pass 1 prompt's "[Slide image attached]" wording updated to reference the PDF page directly.
4. **Supabase direct connection → transaction pooler (Supavisor).** Direct connection is IPv6-only as of Supabase's 2024 change, incompatible with most Vercel serverless and WSL local-dev environments. Pooler (port 6543) is the Supabase-recommended pattern for serverless workloads. `postgres-js` configured with `prepare: false` for transaction-pooled compatibility.
5. **Stripe Checkout enhancements not in SPEC §9.** Three additive options were turned on during Stage B for operational quality of life: `allow_promotion_codes: true` (lets the operator hand out promo codes — produces `no_payment_required` sessions at $0 that the webhook handles as legitimate payments), `customer_creation: "always"` (Stripe creates a Customer object per checkout for receipts/dashboard search), and `payment_intent_data.metadata.product` (tags the PaymentIntent for refund triage). None violate §11. None require subscriptions or user accounts.
6. **`payments.customer_email` column.** Stripe Checkout collects the buyer's email in `customer_details.email`. The webhook persists it on the `payments` row (nullable — promo-code sessions may lack it) so the Stage C upload flow can fetch it without an extra Stripe API roundtrip. SPEC §7 didn't enumerate this column; it's additive and the data was already collected by Stripe anyway.
7. **`decks.customer_email` column (NOT NULL).** Same justification as #6 but at the deck level. The upload flow copies the email from `payments.customer_email` (or falls back to a Stripe session retrieve) when creating the deck row. Required because Stage D email delivery to the buyer cannot proceed without an address — making the column NOT NULL surfaces missing-email anomalies at insert time rather than ghost-failing at delivery time.
8. **`decks_stripe_session_id_unique` unique index.** Migration 0004. SPEC §7 doesn't enumerate indexes, but the spec invariant in §9 ("the same payment can't generate two reports") is enforced at the DB layer here as defense-in-depth. The upload-route's atomic `UPDATE payments SET status='used' WHERE status='paid'` transaction is the primary guard; the unique index catches any future code path that bypasses it.
9. **`verifying` state + `/api/upload/session-status` polling endpoint.** Handles the Stripe-redirect-vs-webhook race the original spec didn't anticipate (Stripe redirects the buyer to `/upload` before the `checkout.session.completed` webhook is delivered). The initial server render calls Stripe to confirm payment; subsequent client polls use a DB-only validation path to avoid burning Stripe rate-limit and to eliminate a DoS surface. Polling timeout is 90 seconds; after that the user is shown a contact-support fallback with their session_id.
10. **Inngest event name `deck/uploaded` and `{deckId}` payload shape.** Implementation detail of deviation #1 (Inngest replacing Cloudflare Worker). The event registry and typed schemas live in `lib/inngest/client.ts` and are plumbed through `EventSchemas.fromRecord` so `.send()` calls are type-checked at compile time.

## Success Criteria

The build is done when:

1. All three test decks (BlockDrive, AgentCorp, deliberately broken test deck) process end-to-end without errors
2. The reports produced match the quality bar specified in SPEC.md Section 10
3. The launch checklist in SPEC.md Section 12 is complete
4. A real payment can be made and produces a real report end-to-end
