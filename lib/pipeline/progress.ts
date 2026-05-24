import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db, decks } from "@/lib/db/client";
import type { PipelineStage } from "@/schemas/pipeline-progress";

/**
 * Atomically merge a stage-completion flag (and optional message) into a
 * deck's `pipeline_progress` JSONB column using Postgres's `||` jsonb merge
 * operator. This is the critical operation for parallel Stage-2 / Stage-3
 * passes: they all write to the same row concurrently, and a naive
 * read-modify-write would lose flags. The `||` merge applies the new keys
 * on top of the row's CURRENT value at write time, so each call commutes.
 */
export async function markStageComplete(
  deckId: string,
  stage: PipelineStage,
  message?: string,
): Promise<void> {
  const patch: Record<string, unknown> = {
    [stage]: true,
    updated_at: new Date().toISOString(),
  };
  if (message) {
    patch.current_message = message;
  }
  const patchJson = JSON.stringify(patch);
  await db
    .update(decks)
    .set({
      pipelineProgress: sql`${decks.pipelineProgress} || ${patchJson}::jsonb`,
    })
    .where(eq(decks.id, deckId));
}

/**
 * Record that a stage started — useful for the /processing UI's live
 * "currently running X" message between completions.
 */
export async function markStageStarted(
  deckId: string,
  message: string,
): Promise<void> {
  const patch = {
    current_message: message,
    updated_at: new Date().toISOString(),
  };
  await db
    .update(decks)
    .set({
      pipelineProgress: sql`${decks.pipelineProgress} || ${JSON.stringify(patch)}::jsonb`,
    })
    .where(eq(decks.id, deckId));
}
