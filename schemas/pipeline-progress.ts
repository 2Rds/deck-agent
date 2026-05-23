import { z } from "zod";

/**
 * Pipeline Progress Schema — tracks which pipeline stages have completed
 * for a given deck. Stored in `decks.pipeline_progress` (JSONB) and polled
 * by the /processing/{deck_id} page every 2 seconds.
 *
 * Stage names map to SPEC.md §8:
 *  - stage_0: Preparation (slide count + text layer extraction)
 *  - stage_1: Pass 1 (parallel per-slide extraction)
 *  - stage_2_pass_2: Pass 2 (math + consistency audit)
 *  - stage_2_pass_3: Pass 3 (investor objections)
 *  - stage_2_pass_4: Pass 4 (structural audit)
 *  - stage_3_pass_5: Pass 5 (specific rewrites)
 *  - stage_3_pass_6: Pass 6 (anxiety addendum, null if Q5 was skipped)
 *  - stage_4: Report finalization + email
 */

export const PipelineStageEnum = z.enum([
  "stage_0",
  "stage_1",
  "stage_2_pass_2",
  "stage_2_pass_3",
  "stage_2_pass_4",
  "stage_3_pass_5",
  "stage_3_pass_6",
  "stage_4",
]);

export type PipelineStage = z.infer<typeof PipelineStageEnum>;

export const PipelineProgressSchema = z.object({
  stage_0: z.boolean().optional(),
  stage_1: z.boolean().optional(),
  stage_2_pass_2: z.boolean().optional(),
  stage_2_pass_3: z.boolean().optional(),
  stage_2_pass_4: z.boolean().optional(),
  stage_3_pass_5: z.boolean().optional(),
  stage_3_pass_6: z.boolean().optional(),
  stage_4: z.boolean().optional(),
  current_message: z.string().optional(),
  updated_at: z.string().optional(),
});

export type PipelineProgress = z.infer<typeof PipelineProgressSchema>;
