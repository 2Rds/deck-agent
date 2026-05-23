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
 * Validate a Stripe Checkout session_id from the success_url query param.
 *
 * Race condition: Stripe redirects the buyer to /upload BEFORE the
 * checkout.session.completed webhook lands. So the order is:
 *
 *   1. Look up the payments row by session_id.
 *   2. If found and paid + unused → ok.
 *   3. If found and used → already_used (deck already created).
 *   4. If not found → fall back to Stripe API to verify payment.
 *      - If Stripe says paid → return "verifying" so the UI can poll briefly.
 *      - If Stripe says unpaid → return "not_paid".
 *      - If Stripe says session doesn't exist → "invalid_session_id".
 *
 * The "verifying" state should NOT defensively write a payments row — that
 * would race with the webhook. Just poll until the webhook lands, with a
 * reasonable timeout (~10s) on the client.
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
    if (dbRow.status === "used" && dbRow.deckId) {
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
    // through to Stripe verification.
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
    const isStripeNotFound =
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "resource_missing";
    if (isStripeNotFound) {
      return { kind: "invalid_session_id" };
    }
    Sentry.captureException(err, {
      tags: { surface: "validate_session_stripe_lookup" },
    });
    return { kind: "internal_error" };
  }
}
