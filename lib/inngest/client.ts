import { Inngest } from "inngest";

/**
 * The Inngest event registry. Each entry is the typed schema for one event
 * the pipeline cares about. Stage D will wire up function handlers; this
 * file is the canonical source of event shapes for both senders and handlers.
 */
type DeckUploadedEvent = {
  name: "deck/uploaded";
  data: {
    deckId: string;
  };
};

type DeckFailedEvent = {
  name: "deck/failed";
  data: {
    deckId: string;
    reason: string;
  };
};

export type DeckRedTeamEvents = {
  "deck/uploaded": DeckUploadedEvent;
  "deck/failed": DeckFailedEvent;
};

let cached: Inngest<{ id: string }> | null = null;

export function getInngest() {
  if (cached) return cached;
  cached = new Inngest({
    id: "deckredteam",
    // INNGEST_EVENT_KEY auto-picked up by the SDK; the SDK falls back to
    // dev mode when running locally without it.
  });
  return cached;
}
