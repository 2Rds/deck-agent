import { getInngest } from "./client";

const inngest = getInngest();

/**
 * Pipeline entry point. WAAS-379 registers a stub that just acks the event so
 * the Inngest dashboard / dev server shows the function and dispatches don't
 * dead-letter. WAAS-380 onward replace the body with the real Stage 0 →
 * Stage 4 work.
 */
export const deckPipeline = inngest.createFunction(
  {
    id: "deck-pipeline",
    name: "DeckRedTeam pipeline",
    // SPEC §8 caps concurrent decks at 10 to stay within Anthropic Tier 2
    // OTPM headroom even with Pass 1 fan-out.
    concurrency: { limit: 10 },
    triggers: [{ event: "deck/uploaded" }],
  },
  async ({ event, step, logger }) => {
    const data = event.data as { deckId: string };
    logger.info("deck/uploaded received (stub)", { deckId: data.deckId });
    await step.run("stub-ack", async () => {
      return { deckId: data.deckId, status: "stub" };
    });
    return { ok: true, deckId: data.deckId };
  },
);

export const functions = [deckPipeline];
