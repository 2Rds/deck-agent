import { z } from "zod";
import {
  stageEnum,
  instrumentEnum,
  targetInvestorsEnum,
} from "@/lib/db/schema";

/**
 * Questionnaire Schema — the 6-question form filled out after payment.
 *
 * Used by the upload page for form validation and by the Worker for
 * variable substitution into prompts.
 *
 * The enum literal values are pulled directly from the Drizzle pgEnums in
 * lib/db/schema.ts to prevent silent drift between the Zod validation layer
 * and the DB enforcement layer. Edit the pgEnum and this updates too.
 */

export const StageEnum = z.enum(stageEnum.enumValues);
export const InstrumentEnum = z.enum(instrumentEnum.enumValues);
export const TargetInvestorsEnum = z.enum(targetInvestorsEnum.enumValues);

export const QuestionnaireSchema = z.object({
  stage: StageEnum,
  round_amount_raw: z.string().min(1).describe(
    "User-entered amount, e.g. '1.5M', '500K', '$2,000,000'. Will be normalized."
  ),
  round_amount_normalized: z.string().describe(
    "Normalized amount with commas, e.g. '1,500,000'. Computed from round_amount_raw."
  ),
  instrument: InstrumentEnum,
  target_investors: TargetInvestorsEnum.optional().describe(
    "Optional. If omitted, treat as 'Generalist seed funds' in prompts."
  ),
  traction_oneline: z.string().max(100).optional().describe(
    "Optional. Founder's traction in one line."
  ),
  biggest_worry: z.string().max(300).optional().describe(
    "Optional. If answered, triggers Pass 6. If omitted, Pass 6 is skipped."
  ),
  additional_context: z.string().max(300).optional().describe(
    "Optional. Catch-all for additional context."
  ),
});

export type Questionnaire = z.infer<typeof QuestionnaireSchema>;

/**
 * Helper for normalizing the round amount.
 * Accepts formats like "1.5M", "500K", "$2,000,000", "2.5M".
 * Returns a normalized string with commas (e.g., "1,500,000") or null if unparseable.
 */
export function normalizeRoundAmount(raw: string): string | null {
  const cleaned = raw.replace(/[\s$,]/g, "").toLowerCase();
  const match = cleaned.match(/^([\d.]+)(k|m|b)?$/);
  if (!match) return null;
  const [, numStr, suffix] = match;
  const num = parseFloat(numStr);
  if (Number.isNaN(num)) return null;
  let value = num;
  if (suffix === "k") value = num * 1_000;
  else if (suffix === "m") value = num * 1_000_000;
  else if (suffix === "b") value = num * 1_000_000_000;
  return Math.round(value).toLocaleString("en-US");
}
