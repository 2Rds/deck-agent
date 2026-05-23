import { Inngest } from "inngest";

/**
 * Event registry — canonical source of event shapes. Inngest v4 doesn't
 * accept a typed schemas option on `new Inngest()`, so we wrap the .send()
 * calls in typed helpers (`sendDeckUploaded`, `sendDeckFailed`) instead.
 * Callers should use the helpers; do not call `getInngest().send()` directly
 * because that path is type-erased.
 */
export type DeckUploadedEvent = {
  name: "deck/uploaded";
  data: { deckId: string };
};

export type DeckFailedEvent = {
  name: "deck/failed";
  data: { deckId: string; reason: string };
};

let cached: Inngest | null = null;

export function getInngest() {
  if (cached) return cached;
  cached = new Inngest({
    id: "deckredteam",
    // INNGEST_EVENT_KEY auto-picked up by the SDK; the SDK falls back to
    // dev mode locally without it.
  });
  return cached;
}

export async function sendDeckUploaded(deckId: string) {
  const event: DeckUploadedEvent = { name: "deck/uploaded", data: { deckId } };
  return getInngest().send(event);
}

export async function sendDeckFailed(deckId: string, reason: string) {
  const event: DeckFailedEvent = {
    name: "deck/failed",
    data: { deckId, reason },
  };
  return getInngest().send(event);
}
