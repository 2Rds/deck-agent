import { z } from "zod";
import { Pass1OutputSchema } from "./pass-1-output";

/**
 * DeckExtraction — assembled output of all Pass 1 calls
 *
 * The Worker runs Pass 1 in parallel across all slides, then assembles
 * the results into this structure before passing to Pass 2, 3, 4, 5, 6.
 */

export const DeckExtractionSchema = z.object({
  total_slides: z.number().int().positive(),
  slide_types_detected: z.array(z.string()).describe(
    "Distinct slide types found in this deck, for quick analysis lookup"
  ),
  slides: z.array(Pass1OutputSchema),
});

export type DeckExtraction = z.infer<typeof DeckExtractionSchema>;
