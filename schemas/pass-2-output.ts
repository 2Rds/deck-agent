import { z } from "zod";

/**
 * Pass 2 Output Schema — Math + Consistency Audit
 *
 * This is the moat. Quality of these findings determines whether
 * the product is worth $29 or feels generic.
 *
 * Validation rules enforced at runtime by the Worker:
 * - Every entry in critical_issues and major_issues must have either
 *   non-null math_shown OR slide_references.length >= 1
 * - executive_verdict must be non-empty
 * On violation, retry once.
 */

export const IssueCategoryEnum = z.enum([
  "MARKET_SIZING",
  "REVENUE_PROJECTION",
  "ASK_ALIGNMENT",
  "TRACTION",
  "TEAM",
  "COMPETITION",
  "NARRATIVE",
  "UNIT_ECONOMICS",
]);

export const IssueSchema = z.object({
  category: IssueCategoryEnum,
  slide_references: z.array(z.number().int().positive()).describe(
    "1-indexed slide numbers this issue references"
  ),
  issue: z.string().min(1).describe(
    "Specific description of what's wrong. No hedging language."
  ),
  math_shown: z.string().nullable().describe(
    "The actual arithmetic exposing the issue. Required for numerical findings."
  ),
  why_it_matters: z.string().min(1).describe(
    "What a partner will think or say in response to this issue."
  ),
  suggested_fix: z.string().min(1).describe(
    "Exactly what to change. No vague advice."
  ),
});

export const Pass2OutputSchema = z.object({
  executive_verdict: z.string().min(1).describe(
    "2-3 sentence brutal honest top-line read, specific to this deck. " +
    "Direct tone. No hedging. If critical issues exist, the verdict reflects that " +
    "without softening preamble."
  ),
  critical_issues: z.array(IssueSchema),
  major_issues: z.array(IssueSchema),
  minor_issues: z.array(IssueSchema),
  anxiety_specific_finding: z.string().nullable().describe(
    "Direct response to founder's stated worry. Cite slide evidence. " +
    "Null if no worry was provided."
  ),
  what_the_deck_does_well: z.array(z.string()).describe(
    "1-3 specific strengths with slide references. " +
    "Empty array if nothing is genuinely strong — do not fabricate positives."
  ),
});

export type Pass2Output = z.infer<typeof Pass2OutputSchema>;
export type Issue = z.infer<typeof IssueSchema>;
