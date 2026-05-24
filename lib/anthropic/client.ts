import Anthropic from "@anthropic-ai/sdk";
import type { ZodSchema } from "zod";
import * as Sentry from "@sentry/nextjs";

let cached: { client: Anthropic; keyPrefix: string } | null = null;

export function getAnthropic(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  const keyPrefix = key.slice(0, 12);
  if (cached && cached.keyPrefix !== keyPrefix) {
    console.warn(
      `[anthropic] key rotation detected (was ${cached.keyPrefix}, now ${keyPrefix}); recreating client`,
    );
    cached = null;
  }
  if (cached) return cached.client;
  const client = new Anthropic({
    apiKey: key,
    // SDK has built-in retries on 429/5xx. Spec §4 mandates up to 3 retries
    // with exponential backoff; the SDK default is 2, so bump it.
    maxRetries: 3,
    // Per-request timeout. Pass calls are typically 5-30s, but Sonnet 4.6 on
    // a complex Pass 2 with 8k max_tokens can take longer. 60s is generous
    // enough for the longest pass without indefinite hangs.
    timeout: 60_000,
  });
  cached = { client, keyPrefix };
  return client;
}

/**
 * Removes ``` and ```json fences from a model response. The prompts all say
 * "Return only the JSON object — no preamble, no markdown fences", but models
 * occasionally produce fences anyway; we strip them defensively before parse.
 */
export function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  // Match opening fence with optional language tag and consume up to and
  // including the first newline.
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenced) return fenced[1].trim();
  return trimmed;
}

/**
 * A single document attachment for vision passes. Pass 1 attaches the
 * single-page PDF representing a slide; later passes are pure text.
 */
export type DocumentAttachment = {
  type: "document";
  source: {
    type: "base64";
    media_type: "application/pdf";
    data: string;
  };
};

export type CallPassOptions<T> = {
  /** Short name for logging / Sentry tags (e.g., "pass_1", "pass_2"). */
  passName: string;
  /** System prompt — sent to the `system` parameter. */
  system: string;
  /** User message text — sent in the user role content. */
  user: string;
  /**
   * Optional document attachments to include in the user content (Pass 1
   * uses this for the single-page PDF). When present, the content becomes a
   * mixed-block array.
   */
  attachments?: DocumentAttachment[];
  /** Zod schema to validate the parsed JSON response. */
  schema: ZodSchema<T>;
  /** Per-spec temperature (e.g., 0.1 for Pass 1, 0.4 for Pass 3). */
  temperature: number;
  /** Per-spec max output tokens. */
  maxTokens: number;
  /**
   * Optional extra context to log/tag with Sentry on failure (e.g., deck_id,
   * slide_number, stripe_session_id).
   */
  tags?: Record<string, string>;
};

const MODEL = "claude-sonnet-4-6";
const VALIDATION_RETRY_HINT =
  "\n\n---\n\nYour previous response failed schema validation. Re-run with strict adherence to the JSON schema. Ensure every required field is populated and the response is a single valid JSON object — no preamble, no markdown fences, no commentary.";

/**
 * Single-call pass execution: build messages → call Anthropic (SDK handles
 * 429/5xx retry) → strip fences → JSON.parse → Zod validate. On a validation
 * failure, retry once with an appended stricter instruction per SPEC §4.
 *
 * Errors bubble up to the Inngest step; that boundary handles Sentry capture
 * and refund coordination.
 */
export async function callPass<T>(opts: CallPassOptions<T>): Promise<T> {
  const client = getAnthropic();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const userText =
      attempt === 0 ? opts.user : opts.user + VALIDATION_RETRY_HINT;

    const userContent: Anthropic.MessageParam["content"] =
      opts.attachments && opts.attachments.length > 0
        ? [
            ...opts.attachments,
            { type: "text" as const, text: userText },
          ]
        : userText;

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: MODEL,
        system: opts.system,
        messages: [{ role: "user", content: userContent }],
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
      });
    } catch (err) {
      // Transport-level error after SDK retries exhausted — fail loud.
      Sentry.captureException(err, {
        tags: {
          surface: "anthropic_call_pass",
          pass_name: opts.passName,
          attempt: String(attempt),
          ...(opts.tags ?? {}),
        },
      });
      throw err;
    }

    const rawText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    const stripped = stripMarkdownFences(rawText);

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripped);
    } catch (parseErr) {
      lastError = new Error(
        `pass ${opts.passName}: JSON.parse failed (attempt ${attempt + 1}): ${(parseErr as Error).message}; raw start: ${stripped.slice(0, 200)}`,
      );
      if (attempt === 0) continue;
      Sentry.captureException(lastError, {
        tags: {
          surface: "anthropic_pass_parse",
          pass_name: opts.passName,
          ...(opts.tags ?? {}),
        },
      });
      throw lastError;
    }

    const validated = opts.schema.safeParse(parsed);
    if (validated.success) {
      return validated.data;
    }
    lastError = new Error(
      `pass ${opts.passName}: Zod validation failed (attempt ${attempt + 1}): ${JSON.stringify(validated.error.flatten())}`,
    );
    if (attempt === 0) continue;
    Sentry.captureException(lastError, {
      tags: {
        surface: "anthropic_pass_validation",
        pass_name: opts.passName,
        ...(opts.tags ?? {}),
      },
    });
    throw lastError;
  }

  // Unreachable: the loop either returns or throws on both iterations.
  throw lastError ?? new Error(`pass ${opts.passName}: exhausted retries`);
}
