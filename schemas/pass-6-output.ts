import { z } from "zod";

/**
 * Pass 6 Output Schema — Anxiety-Targeted Addendum
 *
 * This pass only runs if the founder answered Question 5 (biggest worry).
 * Otherwise the report omits this section entirely.
 *
 * Validation rules (when executed):
 * - addressed_concern must be non-empty
 * - assessment must be one of justified | unfounded | mixed
 * - slide_evidence must be a non-empty array
 * - specific_action_items must contain 1-3 items
 */

export const SlideEvidenceSchema = z.object({
  slide_number: z.number().int().positive(),
  what_the_slide_does: z.string().min(1),
  relevance_to_worry: z.string().min(1).describe(
    "How this slide either confirms the founder's worry is justified " +
    "or shows the deck already addresses it."
  ),
});

export const ActionItemSchema = z.object({
  action: z.string().min(1).describe(
    "Concrete change to make. Specific, not vague."
  ),
  slide_reference: z.number().int().positive().nullable().describe(
    "Slide to change, or null if this is a new slide/section to add."
  ),
});

export const Pass6OutputSchema = z.object({
  addressed_concern: z.string().min(1).describe(
    "Paraphrase of the founder's worry, confirming understanding."
  ),
  assessment: z.enum(["justified", "unfounded", "mixed"]),
  assessment_reasoning: z.string().min(1),
  slide_evidence: z.array(SlideEvidenceSchema).min(1),
  specific_action_items: z.array(ActionItemSchema).min(1).max(3),
});

export type Pass6Output = z.infer<typeof Pass6OutputSchema>;
