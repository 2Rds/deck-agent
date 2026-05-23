import { z } from "zod";

/**
 * Pass 4 Output Schema — Structural Audit
 *
 * Validation rules:
 * - slide_count must equal the actual slide count from Pass 1
 * - missing_slides must be an array (can be empty)
 */

export const MissingSlideSchema = z.object({
  category: z.enum([
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
    "why_now",
    "moat",
    "use_of_funds",
  ]),
  severity: z.enum(["critical", "major", "minor"]),
  rationale: z.string().min(1).describe(
    "Why this slide is needed given the founder's stage and target investors."
  ),
});

export const SlideOrderRecommendationSchema = z.object({
  current_position: z.number().int().positive(),
  recommended_position: z.number().int().positive(),
  rationale: z.string().min(1),
});

export const Pass4OutputSchema = z.object({
  slide_count: z.number().int().positive(),
  slide_count_assessment: z.enum([
    "appropriate",
    "too_short",
    "too_long",
  ]),
  slide_count_notes: z.string().describe(
    "Brief explanation if too_short or too_long; otherwise can be empty."
  ),
  missing_slides: z.array(MissingSlideSchema),
  slide_order_recommendations: z.array(SlideOrderRecommendationSchema),
  hook_assessment: z.object({
    strength: z.enum(["strong", "adequate", "weak"]),
    notes: z.string().describe(
      "What the first slide does or doesn't accomplish."
    ),
  }),
  ask_placement_assessment: z.object({
    ask_present: z.boolean(),
    ask_slide_number: z.number().int().nullable(),
    placement: z.enum(["appropriate", "too_early", "too_late", "missing"]),
    notes: z.string(),
  }),
  redundant_slides: z.array(
    z.object({
      slide_number: z.number().int().positive(),
      rationale: z.string().min(1),
    })
  ),
});

export type Pass4Output = z.infer<typeof Pass4OutputSchema>;
