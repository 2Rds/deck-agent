# DeckRedTeam — Build Specification v1

## How to Use This Document

This is the source-of-truth specification for building DeckRedTeam, an automated pitch deck red team service. It defines *what to build* and *how it should behave*. You decide *how to implement it* — libraries, code structure, error handling specifics, infrastructure plumbing.

**Three rules for Claude Code:**

1. **The prompts in `/prompts/*.md` are source-of-truth. Do not rewrite or "improve" them.** Substitute the `{{variables}}` and send as-is. The exact wording determines output quality and has been iterated on deliberately.

2. **The Zod schemas in `/schemas/*.ts` are source-of-truth.** Use them for runtime validation. Do not modify the field names, types, or structure. You may add code-level types around them.

3. **The "What's NOT in v1" section is binding.** Do not build features listed there, even if they seem helpful or easy. Scope discipline is the single most important constraint for this weekend build.

---

## Section 1: Product Overview

**What it is:** DeckRedTeam is an automated pitch deck analysis service. A founder uploads their pre-seed or seed pitch deck (PDF), pays $29 (intro pricing, $49 standard), answers a 6-question context form, and receives an investor-grade red team report within 5 minutes.

**Who the customer is:** Pre-seed and seed founders actively preparing to fundraise or already in conversations with investors. Typically:
- Stage: pre-seed through Series A
- Geography: primarily US (no localization needed)
- Channel: discovers product via Twitter/X, Indie Hackers, founder Slack/Discord communities, Reddit r/startups, LinkedIn

**Core value proposition:** "Investor-grade red team of your pitch deck. Math gets checked. TAM/SAM/SOM gets stress-tested. Slides that will get you killed in a partner meeting get flagged. Under 5 minutes."

The differentiator is *quality of analysis*, not features. Other tools say "your value prop could be clearer." DeckRedTeam says "Slide 7 states TAM of $15B and SOM of $350M, but Slide 12 projects $25M Year 5 ARR — that's 7.1% of stated SOM, and your continued growth curve through Year 7 would exceed 16% of SOM. A partner will catch this in the first 90 seconds."

**Pricing model:**
- **Launch week (week 1):** $29 one-time per deck, with explicit "introductory pricing" framing on the landing page
- **Week 2 onward:** $49 one-time per deck (standard pricing)
- No subscriptions. No tiers. No team accounts.
- The price change is a config flag, not a code deploy. Standard price and intro-price-active-until-date should be environment variables.

**Launch timeline:**
- Friday night: spec finalized (this document)
- Saturday: build day
- Sunday: testing, polish, deployment
- Monday 7am ET: launch posts go live across Twitter, Indie Hackers, Reddit, LinkedIn, founder communities

**Success criteria for v1:**
- 25-50 paid reports in week one ($725-$1,450 gross)
- Zero broken reports (every paying customer receives a complete, quality report)
- At least 3 unsolicited social-media mentions or testimonials by end of week one
- Architecture stable enough to handle 10 concurrent deck submissions without manual intervention

---

## Section 2: User Flow

### Step 1: Landing page

A single-page marketing site at the root domain. Sections:
- Hero: headline, sub-headline, primary CTA ("Get Your Red Team — $29")
- Social proof / example findings (sanitized example findings from a test deck — show, don't tell)
- "What you get" — 6 deliverables explicitly listed:
  1. Executive verdict
  2. Math + consistency audit (with worked arithmetic on every finding)
  3. Investor objections to preempt (5 partner personas)
  4. Structural improvements (slide order, missing slides, narrative flow)
  5. Specific slide rewrites (before/after on the top 3 issues)
  6. Anxiety-targeted analysis (addressing your specific worry about investor reaction)
- "How it works" — 3-step flow (Pay → Upload → Report in 5 min)
- Intro pricing notice: "$29 introductory pricing, increases to $49 next week"
- FAQ section
- Footer with contact email

Design: clean, document-feel, investor-grade. Dark text on light background. Serif headings, sans-serif body. Not flashy. The product should *look* like the kind of analysis a partner would respect.

### Step 2: Payment

User clicks CTA → Stripe Checkout (hosted, not custom). On payment success, Stripe redirects to `/upload?session_id={CHECKOUT_SESSION_ID}`.

Stripe session metadata should include:
- `product`: "deckredteam_v1"
- `intro_pricing`: true/false

### Step 3: Upload + questionnaire

The upload page validates the Stripe session via the session_id (checking with Stripe API that payment succeeded and hasn't been used yet). If valid, shows:

- File upload (PDF only, max 25MB, drag-and-drop or click)
- The 6-question questionnaire (see Section 5)
- Submit button

If invalid (no session, already used, payment failed): show a clear error and a "contact support" email.

On submit:
- Upload file to R2
- Write a record to the `decks` table with all questionnaire answers + file reference + session_id
- Mark the Stripe session as "used" (so the same payment can't generate two reports)
- Fire the Worker pipeline (see Section 8)
- Redirect to `/processing/{deck_id}`

### Step 4: Processing screen

Live progress screen showing the pipeline stages:

```
✓ Deck received (12 slides detected)
✓ Extracting claims and numbers...
✓ Running math + consistency audit...
⏳ Generating investor objections...
○ Writing structural analysis...
○ Drafting your rewrites...
○ Finalizing report...
```

Each checkmark appears as the corresponding pass completes. The page updates via Server-Sent Events or polling (your call — SSE is cleaner if it works on your stack, polling is simpler).

If the user closes the tab, the email fallback (Step 5) still fires.

Total expected wait: 2-3 minutes for normal decks, up to 5 minutes for larger decks (20-30 slides).

### Step 5: Report delivery

When the pipeline completes:
- Frontend receives final event/state and redirects to `/report/{deck_id}/{access_token}`
- Email sent via Resend to the customer with the same URL
- Report is permanently accessible at that URL (no expiration in v1)

### Step 6: The report

See Section 6 for full report structure.

The report URL is the deliverable. No PDF download in v1 (add in v1.1). No login required to view — the access_token in the URL is the authentication.

A "Share this report" button on the page generates a public-shareable URL (different token, marked `is_public=true` in the database). When public, anyone with the link can view, but the founder's questionnaire answers (especially "biggest worry") are hidden.

---

## Section 3: Technical Architecture

### Stack

- **Frontend:** Next.js (App Router) on Vercel
- **Pipeline runtime:** Inngest on Vercel (durable function execution with per-step retries and parallel step DAG). Replaces the original "Cloudflare Worker" choice — Inngest gives us automatic retries, time-travel replay, and a single deploy target colocated with Next.js.
- **Database:** Postgres on Supabase (direct connection via `postgres-js`; not using Supabase Auth/Storage/Edge Functions). Tables defined in Section 7.
- **File storage:** Cloudflare R2 (for uploaded PDFs only — no rendered slide images stored in v1)
- **Payment:** Stripe Checkout (hosted)
- **Email:** Resend
- **File format:** PDF only. PPTX is not accepted in v1. Landing page and upload page include clear "How to export to PDF" instructions for PowerPoint, Keynote, and Google Slides users. PPTX support is a possible v1.1 feature if customer demand justifies re-adding CloudConvert.
- **Slide ingestion for Pass 1:** PDF sent directly to the Anthropic API via the `document` content block. Claude renders each page server-side for vision processing. No CloudConvert, no PDF→PNG step, no `decks/{id}/slides/` storage. This change saves 15-30s wall-clock per deck and removes one full point of failure.
- **AI:** Anthropic API, model `claude-sonnet-4-6` for all six passes (Tier 2 confirmed)
- **Error monitoring:** Sentry (`@sentry/nextjs` for the Next.js app, `@sentry/node` or the relevant SDK for the Inngest function runtime)

### Why this stack

- Vercel + Next.js: existing AgentCorp/BlockDrive stack — no new infra to learn
- Inngest: durable step execution maps cleanly onto the 6-pass dependency graph; retries and parallel steps are config not code; one less deploy target than a separate CF Worker
- Supabase: managed Postgres, free tier covers launch volume, easier dashboard than Neon for ad-hoc report queries
- R2: cheap, S3-compatible, no egress fees, plays well with serverless
- Stripe Checkout: zero custom code for payment
- Resend: simple API, good deliverability
- Sentry: programmatic project creation via Sentry MCP, error capture across web + worker on day one

### Component communication

```
[Vercel/Next.js frontend]
    ↓ Stripe Checkout
[Stripe] ← webhooks → [Vercel API route /api/webhooks/stripe]
    ↓ writes to
[Postgres on Supabase]
    ↑ writes to
[Vercel API route /api/upload]
    ↓ triggers via inngest.send()
[Inngest pipeline (6 passes as durable steps)]
    ↓ uses
[Anthropic API (PDF input), R2 (deck storage), Resend (delivery)]
    ↓ updates
[Postgres]
    ← polled by →
[Vercel frontend /processing/{deck_id}]
```

### Suggested repo structure

Single Next.js app on Vercel (no separate worker deploy needed — Inngest runs inside the same Next.js app via `/api/inngest`).

```
/
├── app/                       # Next.js App Router pages and API routes
│   ├── (marketing)/page.tsx   # Landing page
│   ├── upload/page.tsx        # Post-payment upload + questionnaire
│   ├── processing/[deckId]/   # Live progress screen
│   ├── report/[deckId]/[token]/  # Private report
│   ├── r/[publicToken]/       # Public shared report
│   └── api/
│       ├── webhooks/stripe/   # Stripe webhook handler
│       ├── checkout/          # Create Stripe Checkout session
│       ├── upload/            # File + questionnaire submission
│       └── inngest/           # Inngest function endpoint
├── lib/
│   ├── inngest/               # Inngest client + pipeline function definitions
│   ├── anthropic/             # Anthropic client + per-pass wrappers
│   ├── prompts/               # The 6 prompt files (loaded at runtime)
│   ├── schemas/               # Zod schemas (moved from /schemas/ at root)
│   ├── db/                    # Supabase Postgres client + queries
│   ├── r2/                    # R2 client for PDF storage
│   └── stripe/                # Stripe client + price logic
├── prompts/                   # Source-of-truth prompt files (symlinked or copied to lib/prompts at build)
├── schemas/                   # Source-of-truth Zod schemas (re-exported from lib/schemas)
├── SPEC.md                    # This document
└── README.md                  # Setup instructions
```

You can also do separate repos if monorepo tooling slows you down. The split between web and worker is what matters; the repo organization is your call.

---

## Section 4: The Six-Pass AI Pipeline

All six passes use `claude-sonnet-4-6`. The pipeline runs in the Cloudflare Worker. Each pass is implemented as a separate function that:

1. Loads the prompt from `/prompts/pass-N.md`
2. Substitutes variables
3. Calls the Anthropic API with the specified temperature, max_tokens, and (where applicable) tool use / structured output
4. Validates output against the Zod schema
5. Retries on validation failure (max 1 retry per pass)
6. Persists the result to Postgres
7. Triggers a progress update for the frontend

### Pass overview

| Pass | Name | Input | Output | Temp | Max tokens |
|------|------|-------|--------|------|------------|
| 1 | Extraction | One slide (image + supplementary text) | `Pass1Output` per slide | 0.1 | 3000 |
| 2 | Math + consistency audit | All Pass 1 outputs + questionnaire | `Pass2Output` | 0.2 | 8000 |
| 3 | Investor objections | All Pass 1 outputs + questionnaire | `Pass3Output` | 0.4 | 5000 |
| 4 | Structural audit | All Pass 1 outputs + questionnaire | `Pass4Output` | 0.2 | 3000 |
| 5 | Rewrites | All Pass 1 outputs + top issues from Pass 2 | `Pass5Output` | 0.5 | 5000 |
| 6 | Anxiety addendum | All Pass 1 outputs + Pass 2 output + questionnaire "biggest worry" | `Pass6Output` or null | 0.3 | 3000 |

### Pass 1 — Extraction

**Purpose:** Convert each slide into structured data for downstream analysis.

**Execution:** Parallel, one call per slide. Use sensible concurrency (process slides in waves to avoid hitting rate limits — your call on the exact batch size based on the API tier in use).

**Prompt:** `/prompts/pass-1.md`

**Output schema:** `schemas/pass-1-output.ts`

**Validation rules after extraction:**
- JSON must parse cleanly. On parse failure, retry once with stricter formatting instructions appended.
- If `slide_type === "ask"`, `ask_details` must not be null. On violation, retry once.
- If `slide_type === "market"`, `market_size_figures` must have ≥1 entry. On violation, retry once.
- If `slide_type === "team"`, `team_members` must have ≥1 entry. On violation, retry once.

After all slides complete, the Worker assembles them into a `DeckExtraction` object (see schema) and persists.

### Pass 2 — Math + Consistency Audit

**Purpose:** Find every mathematical, logical, and consistency error a partner would catch. This is the moat. Quality here determines whether the product is worth $29 or feels generic.

**Execution:** Sequential, one call after Pass 1 completes.

**Prompt:** `/prompts/pass-2.md`

**Output schema:** `schemas/pass-2-output.ts`

**Validation rules:**
- Every entry in `critical_issues` and `major_issues` must have either non-null `math_shown` OR `slide_references` of length ≥1. If a finding lacks both, retry once with a stricter instruction: "Your previous response included findings without specific slide references or math. Re-run with mandatory evidence for every finding."
- `executive_verdict` must be non-empty.

### Pass 3 — Investor Objections

**Purpose:** Generate 5 partner-persona objections the founder should preempt.

**Execution:** Sequential, after Pass 1 (does not depend on Pass 2).

**Prompt:** `/prompts/pass-3.md`

**Output schema:** `schemas/pass-3-output.ts`

**Validation rules:**
- Output must contain exactly 5 personas (Market Skeptic, Competition Hawk, Unit Economics Partner, Team Doubter, Traction Realist).
- Each persona's `objection` and `how_to_preempt` must be non-empty.

### Pass 4 — Structural Audit

**Purpose:** Identify missing slides, slide order issues, narrative gaps.

**Execution:** Sequential, after Pass 1 (does not depend on Passes 2 or 3).

**Prompt:** `/prompts/pass-4.md`

**Output schema:** `schemas/pass-4-output.ts`

**Validation rules:**
- `slide_count` must equal the actual slide count from Pass 1.
- `missing_slides` must be an array (can be empty).

### Pass 5 — Rewrites

**Purpose:** Provide specific before/after rewrites for the top 3 problem slides identified in Pass 2.

**Execution:** Sequential, after Pass 2 (depends on Pass 2 output).

**Prompt:** `/prompts/pass-5.md`

**Output schema:** `schemas/pass-5-output.ts`

**Validation rules:**
- Output must contain 1-3 rewrites (3 is target; fewer is okay if Pass 2 identified fewer than 3 critical/major issues).
- Each rewrite must reference a specific slide number that exists in the deck.

### Pass 6 — Anxiety-Targeted Addendum

**Purpose:** Direct response to the founder's stated worry about investor reaction.

**Execution:** Sequential, after Pass 2. **Only runs if Question 5 ("biggest worry") was answered.** Otherwise skipped and report omits this section.

**Prompt:** `/prompts/pass-6.md`

**Output schema:** `schemas/pass-6-output.ts`

**Validation rules:**
- If executed, `addressed_concern` and `slide_evidence` must be non-empty.

### Pipeline orchestration

The Worker should run passes in this dependency order:

```
Stage 1: Pass 1 (parallel across all slides)
Stage 2: Pass 2, Pass 3, Pass 4 (parallel — none depend on each other)
Stage 3: Pass 5, Pass 6 (parallel — both depend on Pass 2)
Stage 4: Report assembly + email
```

Total wall-clock target: under 3 minutes for a typical 12-slide deck, under 5 minutes worst case.

### Retry and failure handling

- Each pass gets at most 1 retry on validation failure
- Each Anthropic API call gets at most 3 retries on 429 (rate limit) or 5xx errors, with exponential backoff
- If any pass fails after retries, the entire pipeline fails. The user sees an error page with: "Something went wrong processing your deck. Your payment is being refunded automatically and we've been notified." The Worker triggers a Stripe refund via API and sends an alert email to the operator.

---

## Section 5: The Questionnaire

The questionnaire appears on the upload page, **after** Stripe payment, alongside the file upload. All questions are visible at once (no multi-step form).

### Question 1 — Stage (REQUIRED)

**Label:** What stage are you raising?

**Type:** Single-select radio buttons

**Options:**
- Pre-seed
- Seed
- Series A
- Bridge / extension
- Not sure yet

**Validation:** Required, one selection.

### Question 2 — Round details (REQUIRED)

**Label:** What's the round size and instrument?

**Type:** Two fields side-by-side
- Amount: text field with "$" prefix, accepts values like "1.5M", "500K", "$2,000,000"
- Instrument: single-select dropdown
  - SAFE
  - Priced round
  - Convertible note
  - Not decided yet

**Validation:** Both required. Amount field should parse common formats (normalize "1.5M" to "$1,500,000" for downstream use).

### Question 3 — Target investors (OPTIONAL)

**Label:** Who is the deck for?

**Type:** Single-select radio buttons

**Options:**
- Tier 1 VC partners (a16z, Sequoia, etc.)
- Generalist seed funds
- Angel investors / scouts
- Strategic / corporate investors
- Friends & family
- Not sure / haven't decided

**Validation:** Optional. Default behavior if skipped: treat as "Generalist seed funds."

### Question 4 — Current traction (OPTIONAL)

**Label:** What's your current traction in one line?

**Type:** Single-line text field, max 100 chars

**Placeholder:** "$8K MRR, 47 paying customers, 22% MoM growth"

**Helper text:** "Even if your deck doesn't lead with this, tell us the real numbers."

**Validation:** Optional. Default if skipped: empty string passed to prompts.

### Question 5 — Biggest worry (OPTIONAL)

**Label:** What objection are you most worried about hearing?

**Type:** Multi-line text field, max 300 chars

**Placeholder:** "We're worried investors think our market is too small."

**Helper text:** "This is where we focus the deepest analysis."

**Validation:** Optional. If answered, triggers Pass 6. If skipped, Pass 6 is omitted from the pipeline and report.

### Question 6 — Anything else (OPTIONAL)

**Label:** Anything else we should know?

**Type:** Multi-line text field, max 300 chars

**Placeholder:** "We pivoted last month and the deck still has old positioning in places."

**Validation:** Optional.

### Variable substitution into prompts

The questionnaire answers map to prompt variables:

- `{{stage}}` ← Question 1
- `{{round_amount}}` ← Question 2 amount, normalized
- `{{instrument}}` ← Question 2 instrument
- `{{target_investors}}` ← Question 3 (or "Generalist seed funds" if skipped)
- `{{traction_oneline}}` ← Question 4 (or "(not provided)" if skipped)
- `{{biggest_worry}}` ← Question 5 (or "(not provided)" if skipped)
- `{{additional_context}}` ← Question 6 (or "(none)" if skipped)

---

## Section 6: The Report Output

### Structure (in order)

1. **Header**
   - Deck title (from cover slide headline, or "Your Pitch Deck Red Team")
   - Subtitle: Stage + Round size (e.g., "Pre-seed • $1M SAFE")
   - Generated timestamp
   - Share button (top-right)

2. **Executive verdict**
   - From Pass 2 `executive_verdict`
   - Large, prominent — this is the first thing the founder sees and reads
   - Direct tone — no softening preamble

3. **Critical issues** (from Pass 2)
   - One card per issue
   - Each card shows: severity badge, slide references, the issue, the math (formatted clearly), why it matters, suggested fix
   - If empty array: section is omitted (don't show "No critical issues" — that reads as filler)

4. **Major issues** (from Pass 2)
   - Same card format as critical
   - Omit section if empty

5. **Minor issues** (from Pass 2)
   - Collapsible by default ("Show 7 minor issues")
   - Same card format when expanded
   - Omit if empty

6. **Investor objections to preempt** (from Pass 3)
   - 5 cards, one per persona
   - Each card: persona name, the objection (as a quote), which slide triggered it, how to preempt

7. **Structural improvements** (from Pass 4)
   - Slide order recommendations
   - Missing slides flagged
   - Narrative gaps

8. **Specific rewrites** (from Pass 5)
   - 1-3 rewrites
   - Each shows: slide number, current version, rewritten version, rationale
   - Visual emphasis on the before/after comparison

9. **Your specific concern** (from Pass 6, only if Question 5 was answered)
   - Section header: "You told us you're worried about: [their answer]"
   - The addressed concern analysis from Pass 6

10. **What the deck does well** (from Pass 2 `what_the_deck_does_well`)
    - Last section
    - If empty array: omitted entirely (don't fabricate to fill space)
    - This is intentionally last so it doesn't soften the critical feedback above

11. **Footer**
    - "Generated by DeckRedTeam"
    - "Want another deck reviewed? [Link]"

### Visual design

- Clean, document-feel — closer to a Stripe Atlas legal doc or a McKinsey report than a SaaS dashboard
- Serif headings (Source Serif 4 or similar), sans-serif body (Source Sans 3 or Inter)
- Dark text on white/cream background
- Severity badges: critical (red), major (amber), minor (gray)
- Math shown in monospace font, formatted clearly with the arithmetic visible
- Slide references styled as buttons that jump to that slide (in v1.1, deep-link to thumbnails; in v1, just visible references)
- Mobile responsive — many founders will read the report on their phone first

### Public sharing

When a founder clicks "Share this report":
- Generate a new access token marked `is_public=true`
- Show them a shareable URL
- On the public version: hide the questionnaire answers and Question 5 worry, hide any references to the founder's personal context. Show only the analysis.

---

## Section 7: Data Model

### Tables

**`decks`**
- Primary key, created_at
- Stripe session reference
- R2 reference to original uploaded file
- R2 reference to converted PDF (if PPTX was uploaded)
- File metadata: original filename, type (pdf/pptx), size, slide count
- All questionnaire answers (the 6 fields above)
- Status: `uploaded`, `processing`, `complete`, `failed`
- Pipeline progress: which passes have completed (for the progress screen)
- Failure reason (if status = failed)

**`reports`**
- Primary key, foreign key to deck
- Pass 1 output (JSONB, array of slide extractions)
- Pass 2 output (JSONB)
- Pass 3 output (JSONB)
- Pass 4 output (JSONB)
- Pass 5 output (JSONB, nullable)
- Pass 6 output (JSONB, nullable — null if Question 5 was skipped)
- Access tokens: private token (for the buyer) and public token (generated on-demand, nullable initially)
- `is_public` boolean

**`payments`**
- Primary key, created_at
- Stripe session ID, payment intent ID
- Amount paid (cents)
- Intro pricing flag
- Foreign key to deck (if used)
- Status: `pending`, `paid`, `used`, `refunded`

### File storage in R2

- `decks/{deck_id}/original.pdf` — uploaded PDF (the only file stored)

No rendered slide images are stored in v1. Each Pass 1 call fetches the PDF from R2, slices the relevant page, and passes it to Claude via the `document` block. If we later move to a PNG-rendering path, slide images would live at `decks/{deck_id}/slides/slide-{N}.png`.

### Retention

For v1: keep everything indefinitely. Storage is cheap and you may want to review reports for quality improvements. Add a retention policy in v1.1.

---

## Section 8: Pipeline Orchestration

### Trigger

The pipeline starts when the upload endpoint successfully writes the deck to Postgres. The upload route calls `inngest.send({ name: "deck/uploaded", data: { deck_id } })` and returns 202 to the client. Inngest invokes the pipeline function asynchronously and persists step state for retries.

### Stages

**Stage 0 — Preparation (3-8 sec)**
- Load deck record from Postgres
- Fetch the uploaded PDF from R2 (or stream it on demand per Pass 1 call)
- Parse the PDF to get slide count (via `pdf-lib` or `pdfjs-dist` running in the Inngest function — both are pure-JS and run fine in the Vercel/Node runtime)
- Extract text layer per slide (best-effort, may be incomplete — passed as supplementary input to Pass 1)
- Update `decks.status` to `processing`, `slide_count` set
- Emit progress event: "Deck received ({N} slides detected)"

**Stage 1 — Pass 1 (15-30 sec)**
- Run extraction on all slides in parallel (with reasonable concurrency)
- Validate and retry as specified
- Persist combined output to `reports.pass_1_output`
- Emit progress event: "Extracting claims and numbers... ✓"

**Stage 2 — Passes 2, 3, 4 in parallel (30-60 sec total wall time)**
- Pass 2: math audit (longest)
- Pass 3: objections
- Pass 4: structural
- All three run concurrently
- Persist each as it completes
- Emit progress events as each completes

**Stage 3 — Passes 5 and 6 in parallel (15-30 sec)**
- Pass 5: rewrites (depends on Pass 2)
- Pass 6: anxiety addendum (depends on Pass 2, only if Q5 answered)
- Persist and emit progress events

**Stage 4 — Report finalization (3-5 sec)**
- Generate access token
- Update `decks.status` to `complete`
- Send email via Resend to the buyer with the report URL
- Emit final event with the report URL

### Progress reporting to frontend

The frontend at `/processing/{deck_id}` needs to know what stage the pipeline is at. Two options:

**Option A — Server-Sent Events:** Worker writes progress events to a queue, frontend subscribes. Cleaner UX but more infrastructure.

**Option B — Polling:** Frontend polls a Vercel API route every 2 seconds. Vercel reads from Postgres `decks.pipeline_progress` (a JSONB field with stage flags). Simpler.

Recommendation: **Option B**. Polling at 2s interval for 3 minutes = 90 requests per deck. Trivial load. Simpler to debug.

### Concurrency considerations

- Multiple decks may be in processing simultaneously
- Inngest handles per-deck function invocations cleanly — each `deck/uploaded` event spawns its own function run with isolated step state
- Anthropic Tier 2 limits: 100K ITPM / 20K OTPM on Sonnet 4.6. Pass 1 is throttled to 6 parallel slide-extraction calls per deck to stay under OTPM even with 2-3 concurrent decks in flight. Larger decks (>18 slides) process Pass 1 in waves of 6.
- Inngest concurrency cap set to 10 concurrent pipeline runs at launch. Above that, events queue.

---

## Section 9: Payment and Access Control

### Stripe Checkout configuration

- Mode: `payment` (one-time)
- Line items: 1 product, dynamic price (intro vs standard)
- Success URL: `https://[domain]/upload?session_id={CHECKOUT_SESSION_ID}`
- Cancel URL: `https://[domain]/`
- Metadata: `{ product: "deckredteam_v1", intro_pricing: "true"|"false" }`

### Stripe webhook handling

Vercel API route `/api/webhooks/stripe` handles:
- `checkout.session.completed` — write to `payments` table with status `paid`
- `payment_intent.payment_failed` — log for monitoring
- `charge.refunded` — update `payments.status` to `refunded`

Webhook signature verification required.

### Session-to-upload binding

When the user lands on `/upload?session_id=X`:
1. Verify the session exists in `payments` table with status `paid`
2. Verify it has not been used (no associated `deck_id`)
3. If both pass, allow upload
4. On submit, atomically: create deck record, set `payments.deck_id`, set `payments.status` to `used`

This prevents the same payment from generating two reports.

### Access tokens

When a report is ready:
- Generate a long random token (e.g., 32 chars, URL-safe base64)
- Store in `reports.private_token`
- The URL `https://[domain]/report/{deck_id}/{private_token}` is the deliverable

When the user clicks "Share":
- Generate a separate `public_token`
- Set `reports.is_public = true`
- The URL `https://[domain]/r/{public_token}` shows the report with personal context hidden

### Intro pricing switch

Environment variables:
- `INTRO_PRICE_CENTS` (default 2900)
- `STANDARD_PRICE_CENTS` (default 4900)
- `INTRO_PRICING_END_DATE` (ISO date string)

At runtime, when generating a Stripe Checkout session, the code checks if `now < INTRO_PRICING_END_DATE`. If yes, use intro price and metadata flag. If no, use standard price.

Changing the price means changing the env var and redeploying — no code changes required.

---

## Section 10: Testing Protocol

### Before launch, test on at least 3 real decks:

**Test 1: BlockDrive deck (known good ground truth)**
The operator (Sean) has detailed knowledge of what should be found. Specifically: the SOM math ($350M = 35K × $10K ACV), TAM ($15B EFSS), CAGR (~29%). Pass 2 should catch the math correctness without inventing errors.

**Test 2: AgentCorp deck**
Different industry, different stage profile. Tests prompt generalization across categories.

**Test 3: Deliberately broken test deck**
Create a PDF with:
- No team slide
- A market sizing slide with internally contradictory numbers (e.g., TAM = $10B, SOM = $50B)
- A financials slide where Year 5 ARR exceeds stated SOM
- Vague team credentials ("ex-FAANG executive", "former Wall Street")
- An ask with arithmetic that doesn't match runway

Pass 2 should catch every one of these issues with specific math shown.

### Quality bar per pass

**Pass 1:** Extracts every visible number on every slide. Test by manually counting numbers on 3 slides and comparing to extraction output.

**Pass 2:** On the broken test deck, every planted error is identified as critical or major with correct math. No hallucinated errors.

**Pass 3:** Five distinct persona objections, each tied to a specific slide. No generic objections like "make your value prop clearer."

**Pass 4:** On the broken test deck (no team slide), correctly identifies missing team slide as a critical structural issue.

**Pass 5:** Rewrites are concrete and specific to the actual slide content, not generic.

**Pass 6:** Directly addresses the stated worry with slide-specific evidence.

### Pre-launch manual checklist

- [ ] All 3 test decks process end-to-end without errors
- [ ] Reports load on mobile correctly
- [ ] Share button generates working public URL with personal context hidden
- [ ] Email delivery works (test from a fresh email address)
- [ ] Stripe webhook fires correctly on test payment
- [ ] Refund flow tested with a test refund in Stripe dashboard
- [ ] Failure mode: simulate an API error mid-pipeline and verify graceful failure + refund trigger
- [ ] Domain configured, SSL working, no console errors on landing page

---

## Section 11: What's NOT in v1

This list is binding. Do not build any of the following, even if they seem easy or helpful.

- ❌ User login / authentication system. Access is via tokenized URLs.
- ❌ Subscription pricing or recurring billing.
- ❌ Slack, Telegram, WhatsApp, Discord, or any chat integration.
- ❌ Team accounts, multi-user, organizations.
- ❌ Revision tracking or "re-review my updated deck" features.
- ❌ Human-in-the-loop review tier or premium tier.
- ❌ Comparison against past decks ("how did my deck improve").
- ❌ Anonymous benchmarking against other decks in the database.
- ❌ Native PDF export of the report. (v1.1 feature.)
- ❌ Deep-linked slide thumbnails in the report. (v1.1.)
- ❌ Multi-language support.
- ❌ Custom branding / white-label.
- ❌ API access for programmatic deck submission.
- ❌ Affiliate / referral program. (v2.)
- ❌ Admin dashboard for the operator to view all reports. (Use Postgres directly via Neon/Supabase console for v1.)
- ❌ Customer support ticket system. (Use a `support@` email forwarded to operator's inbox.)
- ❌ Analytics dashboard. (PostHog or similar can be added but is not required for launch.)

If you find yourself building any of the above, stop. Re-read this section. Then continue with what's actually in v1.

---

## Section 12: Launch Checklist

### Pre-launch infrastructure setup (Saturday)

- [ ] Domain registered (operator picks; using `deckredteam.com` as placeholder in env vars until chosen)
- [ ] Vercel project created and linked to repo
- [ ] Cloudflare account: R2 bucket created (Workers no longer used)
- [ ] Supabase project created, Postgres connection string in env vars
- [ ] Inngest account created, app registered, signing key + event key in env vars
- [ ] Stripe account in live mode, product created, webhook endpoint registered
- [ ] Resend account, domain verified, API key in env vars
- [ ] Sentry project created (via Sentry MCP), DSN in env vars
- [ ] Anthropic API key in env vars (Tier 2 confirmed for Sonnet 4.6)

### Environment variables (final list)

Single Next.js app on Vercel (Inngest runs inside the same app via `/api/inngest`):

- `BRAND_DOMAIN` (placeholder: `deckredteam.com`)
- `PUBLIC_BASE_URL`
- `DATABASE_URL` (Supabase Postgres direct connection)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRICE_ID_INTRO` (or compute dynamically)
- `STRIPE_PRICE_ID_STANDARD`
- `INTRO_PRICE_CENTS` (default 2900)
- `STANDARD_PRICE_CENTS` (default 4900)
- `INTRO_PRICING_END_DATE`
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_ACCOUNT_ID`
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`
- `SENTRY_DSN`
- `SENTRY_AUTH_TOKEN` (for source-map upload at build)

### Launch day (Monday 7am ET)

- [ ] Final smoke test: submit a real deck end-to-end with a real payment
- [ ] Twitter/X launch thread posted
- [ ] Indie Hackers post
- [ ] Reddit r/startups, r/Entrepreneur posts (read each subreddit's promo rules first)
- [ ] LinkedIn post
- [ ] Posts in 3-5 founder Slack/Discord communities (On Deck, YC SUS, Indie Hackers, etc.)
- [ ] Monitor inbox + Stripe dashboard for first 8 hours
- [ ] Respond to questions and issues in real time

---

## Appendix A: Prompt File Conventions

Each prompt file in `/prompts/` follows this structure:

```
# Pass N — [Name]

## Meta
- Model: claude-sonnet-4-6
- Temperature: 0.X
- Max tokens: NNNN

## System Prompt

[The full system prompt text — this is sent to the API as-is]

## User Message Template

[The user message template with {{variables}} for substitution]

## Variables

- {{var1}}: description
- {{var2}}: description
```

Variables are substituted by the Worker at runtime, not by the prompt loader. The prompt files are plain text — no templating language used inside them.

---

## Appendix B: Schema File Conventions

Schema files in `/schemas/` are TypeScript files exporting Zod schemas. Each pass has its own file:

- `pass-1-output.ts` — exports `Pass1Output` schema and inferred type
- `pass-2-output.ts` — exports `Pass2Output` schema and inferred type
- ... etc.
- `deck-extraction.ts` — exports `DeckExtraction` (the assembled output of all Pass 1 calls)
- `questionnaire.ts` — exports `Questionnaire` schema for the form data

Use `zod-to-json-schema` if you need to convert these for Anthropic's structured output feature, or just use Zod's `.parse()` for runtime validation.
