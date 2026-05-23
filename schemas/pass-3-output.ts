import { z } from "zod";

/**
 * Pass 3 Output Schema — Investor Objections
 *
 * Exactly 5 personas, in the order specified by the prompt.
 *
 * Validation rules:
 * - Must contain exactly 5 objections
 * - Each objection's text and how_to_preempt must be non-empty
 */

export const PartnerPersonaEnum = z.enum([
  "Market Skeptic",
  "Competition Hawk",
  "Unit Economics Partner",
  "Team Doubter",
  "Traction Realist",
]);

export const ObjectionSchema = z.object({
  persona: PartnerPersonaEnum,
  objection: z.string().min(1).describe(
    "Direct quote as the partner would say it in a meeting. Specific to a slide. No generic phrasing."
  ),
  slide_trigger: z.number().int().positive().describe(
    "The slide that triggered this objection"
  ),
  how_to_preempt: z.string().min(1).describe(
    "Specific action to take — typically a slide change or added data point. " +
    "No vague advice."
  ),
});

export const Pass3OutputSchema = z.object({
  objections: z.array(ObjectionSchema).length(5),
});

export type Pass3Output = z.infer<typeof Pass3OutputSchema>;
export type Objection = z.infer<typeof ObjectionSchema>;
