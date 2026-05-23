import { z } from "zod";

/**
 * Pass 5 Output Schema — Specific Slide Rewrites
 *
 * 1-3 rewrites, ordered by severity of the issue they address.
 * Empty array is valid if Pass 2 found no critical or major issues.
 *
 * Validation rules:
 * - 0-3 rewrites (empty allowed if no critical/major issues from Pass 2)
 * - Each rewrite must reference a slide number that exists in the deck
 */

export const RewriteSchema = z.object({
  slide_number: z.number().int().positive(),
  current_version: z.string().min(1).describe(
    "Concise summary of what the slide currently says, drawn from Pass 1 extraction."
  ),
  rewritten_version: z.string().min(1).describe(
    "Specific deck-ready rewrite. Real pitch slides are short — headlines 5-10 words, " +
    "bullets 1-2 lines. No essays."
  ),
  rationale: z.string().min(1).describe(
    "Why this is better for an investor. Specific. No platitudes."
  ),
  what_it_fixes: z.array(z.string()).min(1).describe(
    "Which Pass 2 finding(s) this rewrite addresses, by issue category or short description."
  ),
});

export const Pass5OutputSchema = z.object({
  rewrites: z.array(RewriteSchema).max(3),
});

export type Pass5Output = z.infer<typeof Pass5OutputSchema>;
export type Rewrite = z.infer<typeof RewriteSchema>;
