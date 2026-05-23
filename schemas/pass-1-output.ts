import { z } from "zod";

/**
 * Pass 1 Output Schema — Per-slide extraction
 *
 * One instance of this schema is produced per slide in the deck.
 * The Worker then assembles all instances into a DeckExtraction object
 * (see deck-extraction.ts) which is passed to downstream passes.
 *
 * Validation rules enforced at runtime by the Worker:
 * - If slide_type === "ask", ask_details must not be null
 * - If slide_type === "market", market_size_figures must have length >= 1
 * - If slide_type === "team", team_members must have length >= 1
 * On any violation, retry once with stricter instructions.
 */

export const SlideTypeEnum = z.enum([
  "cover",
  "problem",
  "solution",
  "product",
  "market",
  "traction",
  "business_model",
  "gtm",
  "competition",
  "team",
  "financials",
  "ask",
  "vision",
  "roadmap",
  "use_of_funds",
  "thesis",
  "why_now",
  "moat",
  "case_study",
  "intro",
  "other",
]);

export const NumberSchema = z.object({
  value: z.string().describe("Exact value as shown, e.g. '$15B' or '20%'"),
  unit: z.string().describe("What it measures, e.g. 'TAM', 'MoM growth'"),
  context: z.string().describe("Surrounding text/label giving the number meaning"),
  source_cited: z.string().nullable().describe("Source named on the slide, or null"),
});

export const MarketSizeFigureSchema = z.object({
  label: z.string().describe("TAM | SAM | SOM | other label as shown"),
  value: z.string().describe("Exact value as shown, e.g. '$15B'"),
  year: z.string().nullable().describe("Year referenced, or null"),
  source_cited: z.string().nullable().describe("Source named on slide, or null"),
  methodology_described: z.boolean().describe(
    "True if the slide explains how this figure was calculated (bottom-up: X × Y), false otherwise"
  ),
});

export const FinancialFigureSchema = z.object({
  metric: z.enum([
    "ARR",
    "MRR",
    "revenue",
    "burn",
    "CAC",
    "LTV",
    "gross_margin",
    "retention",
    "churn",
    "payback_period",
    "runway",
    "other",
  ]),
  metric_label_other: z.string().nullable().describe(
    "Required if metric is 'other', else null"
  ),
  value: z.string().describe("Exact value as shown"),
  time_period: z.string().nullable().describe(
    "e.g. 'Year 5', 'Q4 2025', 'current', 'projected'"
  ),
});

export const TeamMemberSchema = z.object({
  name: z.string().nullable().describe("Full name as shown, or null if not shown"),
  title: z.string().nullable().describe("Role on the team, or null if not shown"),
  claimed_credentials: z.array(z.string()).describe(
    "Credentials and background claims from the slide"
  ),
  credential_specificity: z.enum(["specific", "vague"]).describe(
    "specific: names companies/schools/years; vague: 'ex-FAANG', 'former exec', 'industry veteran'"
  ),
});

export const AskDetailsSchema = z.object({
  amount: z.string().describe("Exact amount as shown, e.g. '$1M' or '$2.5M'"),
  instrument: z.enum([
    "SAFE",
    "priced_round",
    "convertible_note",
    "other",
    "not_stated",
  ]),
  valuation: z.string().nullable().describe(
    "Post-money cap or valuation if stated, else null"
  ),
  use_of_funds: z.array(z.string()).describe(
    "Stated uses of funds if shown on the slide"
  ),
});

export const TractionMetricSchema = z.object({
  metric: z.enum([
    "MRR",
    "ARR",
    "users",
    "customers",
    "pilots",
    "signups",
    "waitlist",
    "downloads",
    "revenue",
    "GMV",
    "other",
  ]),
  metric_label_other: z.string().nullable(),
  value: z.string().describe("Exact value as shown"),
  time_period: z.string().nullable().describe("e.g. 'current', 'as of Q3 2026'"),
  is_paying: z.enum(["true", "false", "unclear"]).describe(
    "Whether the slide explicitly states these are paying customers"
  ),
});

export const VisualElementsSchema = z.object({
  chart_present: z.boolean(),
  chart_has_numerical_labels: z.boolean().nullable(),
  chart_description: z.string().nullable(),
  image_density: z.enum(["low", "medium", "high"]),
  text_legibility: z.enum(["good", "poor"]),
  customer_logos_present: z.boolean().describe(
    "True if customer/partner logos are visible on the slide"
  ),
  customer_logo_count_approx: z.number().nullable().describe(
    "Approximate count of customer/partner logos, or null if none"
  ),
});

export const Pass1OutputSchema = z.object({
  slide_number: z.number().int().positive(),
  slide_type: SlideTypeEnum,
  slide_type_notes: z.string().nullable().describe(
    "Explanation if slide_type is 'other' or ambiguous"
  ),
  headline: z.string().nullable().describe(
    "The primary heading/title as written, or null if no clear headline"
  ),
  stated_claims: z.array(z.string()).describe(
    "Factual claims made on the slide, preserving original phrasing"
  ),
  numbers: z.array(NumberSchema),
  market_size_figures: z.array(MarketSizeFigureSchema),
  financial_figures: z.array(FinancialFigureSchema),
  team_members: z.array(TeamMemberSchema),
  ask_details: AskDetailsSchema.nullable(),
  traction_metrics: z.array(TractionMetricSchema),
  competitors_named: z.array(z.string()),
  visual_elements: VisualElementsSchema,
});

export type Pass1Output = z.infer<typeof Pass1OutputSchema>;
