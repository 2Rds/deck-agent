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

## Stack Decisions Already Made

- Next.js + Vercel for web
- Cloudflare Worker for the pipeline
- Postgres on Neon or Supabase
- Cloudflare R2 for files
- Stripe Checkout
- Resend for email
- CloudConvert for PPTX→PDF and PDF→PNG
- `claude-sonnet-4-6` for all six passes
- Zod for runtime validation

## Stack Decisions Left to You

- Drizzle vs Prisma vs raw SQL for DB layer
- SSE vs polling for progress UI (SPEC.md recommends polling)
- Specific PDF-to-image approach within the Worker constraints
- Exact concurrency primitives
- CSS approach (Tailwind, vanilla CSS, etc. — Tailwind recommended given operator's existing stack familiarity)
- Specific monitoring/logging approach

## Questions for the Operator (Sean) Before Starting

If you have questions that the spec doesn't answer, ask before building. Better to clarify than to build the wrong thing. Specifically check:

- Domain name choice (the spec doesn't pick one)
- Whether to use Neon or Supabase
- Whether to use CloudConvert paid tier or ConvertAPI free tier for v1
- Anthropic API tier (must be Tier 2+ for Sonnet 4.6 at expected volume — verify before building)
- Whether the operator wants to set up monitoring (Sentry, etc.) at launch or defer

## Success Criteria

The build is done when:

1. All three test decks (BlockDrive, AgentCorp, deliberately broken test deck) process end-to-end without errors
2. The reports produced match the quality bar specified in SPEC.md Section 10
3. The launch checklist in SPEC.md Section 12 is complete
4. A real payment can be made and produces a real report end-to-end
