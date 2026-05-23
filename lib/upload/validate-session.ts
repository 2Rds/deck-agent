import { db, payments } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { getStripe } from "@/lib/stripe/client";
import * as Sentry from "@sentry/nextjs";

const STRIPE_SESSION_ID_RE = /^cs_(test|live)_[a-zA-Z0-9]+$/;

export type ValidationResult =
  | {
      kind: "ok";
      sessionId: string;
      customerEmail: string | null;
      amountCents: number;
      introPricing: boolean;
    }
  | {
      kind: "missing_session_id";
    }
  | {
      kind: "invalid_session_id";
    }
  | {
      kind: "not_paid";
      reason: string;
    }
  | {
      kind: "already_used";
      deckId: string;
    }
  | {
      kind: "verifying"; // Stripe confirms paid but webhook hasn't landed
      sessionId: string;
      customerEmail: string | null;
    }
  | {
      kind: "internal_error";
    };

/**
 * DB-only session check for the polling endpoint. Returns `ok`/`already_used`
 * once the webhook has landed, or `verifying` otherwise. Intentionally does
 * NOT call Stripe — the initial server-component render already did the
 * Stripe lookup; subsequent polls are waiting for the webhook to write the DB
 * row. Skipping Stripe here prevents (a) burning Stripe rate-limit on a 1.5s
 * poll loop, and (b) a DoS vector where unauthenticated callers proxy
 * Stripe API calls through us.
 */
export async function validateSessionDbOnly(
  sessionIdRaw: string | undefined | null,
): Promise<
  | { kind: "ok" }
  | { kind: "already_used"; deckId: string }
  | { kind: "verifying" }
  | { kind: "not_paid" }
  | { kind: "missing_session_id" }
  | { kind: "invalid_session_id" }
  | { kind: "internal_error" }
> {
  if (!sessionIdRaw) return { kind: "missing_session_id" };
  if (!STRIPE_SESSION_ID_RE.test(sessionIdRaw)) return { kind: "invalid_session_id" };

  try {
    const rows = await db
      .select({ status: payments.status, deckId: payments.deckId })
      .from(payments)
      .where(eq(payments.stripeSessionId, sessionIdRaw))
      .limit(1);
    const row = rows[0];
    if (!row) return { kind: "verifying" };
    if (row.status === "used") {
      if (!row.deckId) {
        Sentry.captureMessage(
          "payment.status='used' but deck_id is null (poll path)",
          { level: "fatal", tags: { stripe_session_id: sessionIdRaw } },
        );
        return { kind: "internal_error" };
      }
      return { kind: "already_used", deckId: row.deckId };
    }
    if (row.status === "paid") return { kind: "ok" };
    if (row.status === "refunded") return { kind: "not_paid" };
    return { kind: "verifying" };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { surface: "validate_session_db_only" },
    });
    return { kind: "internal_error" };
  }
}

/**
 * Full session validation for the initial /upload server-component render.
 *
 * Race condition: Stripe redirects to /upload BEFORE the
 * checkout.session.completed webhook lands. So:
 *
 *   1. Look up the payments row by session_id.
 *   2. If found and paid + unused → ok.
 *   3. If found and used → already_used (deck already created).
 *   4. If not found → fall back to Stripe API to verify payment.
 *      - If Stripe says paid → return "verifying" so the UI can poll briefly.
 *      - If Stripe says unpaid → return "not_paid".
 *      - If Stripe says session doesn't exist → "invalid_session_id".
 *
 * The "verifying" state must NOT defensively write a payments row — that
 * would race with the webhook. The UI polls validateSessionDbOnly until the
 * webhook lands, with a 90s client timeout.
 */
export async function validateSession(
  sessionIdRaw: string | undefined | null,
): Promise<ValidationResult> {
  if (!sessionIdRaw) {
    return { kind: "missing_session_id" };
  }
  if (!STRIPE_SESSION_ID_RE.test(sessionIdRaw)) {
    return { kind: "invalid_session_id" };
  }
  const sessionId = sessionIdRaw;

  // 1. Look in the DB first — happy path if webhook arrived in time.
  let dbRow:
    | {
        status: "pending" | "paid" | "used" | "refunded";
        deckId: string | null;
        customerEmail: string | null;
        amountCents: number;
        introPricing: boolean;
      }
    | undefined;
  try {
    const rows = await db
      .select({
        status: payments.status,
        deckId: payments.deckId,
        customerEmail: payments.customerEmail,
        amountCents: payments.amountCents,
        introPricing: payments.introPricing,
      })
      .from(payments)
      .where(eq(payments.stripeSessionId, sessionId))
      .limit(1);
    dbRow = rows[0];
  } catch (err) {
    Sentry.captureException(err, {
      tags: { surface: "validate_session_db_lookup" },
    });
    return { kind: "internal_error" };
  }

  if (dbRow) {
    if (dbRow.status === "used") {
      if (!dbRow.deckId) {
        // Invariant violation: status='used' should always have a deck_id set
        // atomically in the upload-route transaction. Surface loudly — the
        // customer would otherwise silently poll forever.
        Sentry.captureMessage(
          "payment.status='used' but deck_id is null — invariant violated",
          {
            level: "fatal",
            tags: { stripe_session_id: sessionId },
          },
        );
        return { kind: "internal_error" };
      }
      return { kind: "already_used", deckId: dbRow.deckId };
    }
    if (dbRow.status === "paid") {
      return {
        kind: "ok",
        sessionId,
        customerEmail: dbRow.customerEmail,
        amountCents: dbRow.amountCents,
        introPricing: dbRow.introPricing,
      };
    }
    if (dbRow.status === "refunded") {
      return { kind: "not_paid", reason: "payment was refunded" };
    }
    // status === "pending" — odd; webhook should have flipped to paid. Fall
    // through to Stripe verification. Surface a Sentry alert ONLY for rows
    // older than 30s — for fresh rows the webhook is just racing the render
    // and shouldn't generate alert noise.
    // Note: Drizzle doesn't expose createdAt on the partial select above,
    // so refetch only when we're already past the fast path.
    const stale = await db
      .select({ createdAt: payments.createdAt })
      .from(payments)
      .where(eq(payments.stripeSessionId, sessionId))
      .limit(1);
    const ageMs = stale[0]
      ? Date.now() - new Date(stale[0].createdAt).getTime()
      : 0;
    if (ageMs > 30_000) {
      Sentry.captureMessage("payment row stuck in pending state for >30s", {
        level: "warning",
        tags: {
          stripe_session_id: sessionId,
          age_ms: String(ageMs),
        },
      });
    }
  }

  // 2. Fall back to Stripe API to verify directly.
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
      // The webhook will land momentarily; tell the UI to poll.
      return {
        kind: "verifying",
        sessionId,
        customerEmail: session.customer_details?.email ?? null,
      };
    }
    return {
      kind: "not_paid",
      reason: `payment status is ${session.payment_status}`,
    };
  } catch (err) {
    const code =
      err instanceof Error && "code" in err
        ? (err as { code?: string }).code
        : undefined;
    const errType =
      err instanceof Error && "type" in err
        ? (err as { type?: string }).type
        : undefined;

    // Session truly doesn't exist on Stripe.
    if (code === "resource_missing") {
      return { kind: "invalid_session_id" };
    }
    // Session existed but has expired (Stripe expires Checkout sessions
    // ~24h after creation). Surface to the user as not_paid so they get a
    // clear message rather than "internal error."
    if (code === "checkout_session_expired" || code === "session_expired") {
      return { kind: "not_paid", reason: "checkout session expired" };
    }
    // Stripe API itself degraded — log and surface as internal_error.
    Sentry.captureException(err, {
      tags: {
        surface: "validate_session_stripe_lookup",
        stripe_error_type: errType ?? "unknown",
        stripe_error_code: code ?? "unknown",
      },
    });
    return { kind: "internal_error" };
  }
}
