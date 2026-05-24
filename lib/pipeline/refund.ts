import { eq } from "drizzle-orm";
import * as Sentry from "@sentry/nextjs";
import { db, decks, payments } from "@/lib/db/client";
import { getStripe } from "@/lib/stripe/client";
import { sendReportEmail, sendOperatorAlert } from "@/lib/email/client";

/**
 * Triggered by the pipeline root catch when a deck is marked failed. Fetches
 * the linked payment, issues a Stripe refund via the SDK (idempotent on
 * deck_id), updates `payments.status` to "refunded", and emails the customer.
 *
 * All errors caught + Sentry-tagged with `requires_manual_refund: "true"` so
 * the operator can intervene if automation fails.
 */
export async function issueRefundForDeck(
  deckId: string,
  failureReason: string,
): Promise<void> {
  // Look up the payment row for this deck. Stage C's upload route sets
  // payments.deck_id atomically when the deck row is inserted.
  let paymentRow:
    | {
        stripePaymentIntentId: string | null;
        stripeSessionId: string;
        amountCents: number;
        customerEmail: string | null;
        status: "pending" | "paid" | "used" | "refunded";
      }
    | undefined;
  try {
    const rows = await db
      .select({
        stripePaymentIntentId: payments.stripePaymentIntentId,
        stripeSessionId: payments.stripeSessionId,
        amountCents: payments.amountCents,
        customerEmail: payments.customerEmail,
        status: payments.status,
      })
      .from(payments)
      .where(eq(payments.deckId, deckId))
      .limit(1);
    paymentRow = rows[0];
  } catch (err) {
    Sentry.captureException(err, {
      tags: {
        surface: "refund_payment_lookup",
        deck_id: deckId,
        requires_manual_refund: "true",
        failure_reason: failureReason,
      },
    });
    return;
  }

  if (!paymentRow) {
    Sentry.captureMessage("refund: no payment row for deck", {
      level: "fatal",
      tags: {
        surface: "refund_payment_missing",
        deck_id: deckId,
        requires_manual_refund: "true",
        failure_reason: failureReason,
      },
    });
    return;
  }

  if (paymentRow.status === "refunded") {
    // Already refunded — Inngest must have retried the root catch. No-op.
    return;
  }

  if (!paymentRow.stripePaymentIntentId) {
    // Payment row exists but Stripe never sent the payment_intent_id (rare
    // edge of no_payment_required + dashboard manual session). Surface to
    // operator — there's nothing to refund through the API.
    Sentry.captureMessage("refund: payment has no payment_intent_id", {
      level: "error",
      tags: {
        surface: "refund_no_payment_intent",
        deck_id: deckId,
        stripe_session_id: paymentRow.stripeSessionId,
        requires_manual_refund: "true",
      },
    });
    return;
  }

  // Promo-code-paid sessions (amount=0) don't get refunded — there's nothing
  // to return. Just mark the row and email the customer.
  if (paymentRow.amountCents > 0) {
    try {
      const stripe = getStripe();
      await stripe.refunds.create(
        {
          payment_intent: paymentRow.stripePaymentIntentId,
          reason: "requested_by_customer",
          metadata: {
            deck_id: deckId,
            failure_reason: failureReason,
          },
        },
        {
          // Idempotency key prevents duplicate refunds if Inngest retries
          // the root catch handler. Keyed on deck_id (not payment_intent)
          // because Stripe permits multiple refunds per PI but our policy
          // is exactly one full refund per deck failure.
          idempotencyKey: `deckredteam-refund-${deckId}`,
        },
      );
    } catch (err) {
      Sentry.captureException(err, {
        tags: {
          surface: "refund_stripe_create",
          deck_id: deckId,
          payment_intent_id: paymentRow.stripePaymentIntentId,
          requires_manual_refund: "true",
          failure_reason: failureReason,
        },
      });
      // Don't return — still try to email the customer and update the row.
    }
  }

  try {
    await db
      .update(payments)
      .set({ status: "refunded" })
      .where(eq(payments.stripePaymentIntentId, paymentRow.stripePaymentIntentId));
  } catch (err) {
    Sentry.captureException(err, {
      tags: {
        surface: "refund_db_update",
        deck_id: deckId,
        requires_manual_refund: "true",
      },
    });
  }

  // Email the customer if we have an address. Stage C populates
  // decks.customer_email NOT NULL, but the payments row may have null.
  let toEmail = paymentRow.customerEmail;
  if (!toEmail) {
    try {
      const dRows = await db
        .select({ customerEmail: decks.customerEmail })
        .from(decks)
        .where(eq(decks.id, deckId))
        .limit(1);
      toEmail = dRows[0]?.customerEmail ?? null;
    } catch {
      // ignore — operator alert will still fire
    }
  }
  if (toEmail) {
    try {
      await sendCustomerRefundEmail(toEmail);
    } catch (err) {
      Sentry.captureException(err, {
        tags: {
          surface: "refund_customer_email",
          deck_id: deckId,
          requires_manual_refund: "false",
        },
      });
    }
  } else {
    Sentry.captureMessage("refund: cannot email customer (no address)", {
      level: "warning",
      tags: { surface: "refund_no_email", deck_id: deckId },
    });
  }

  try {
    await sendOperatorAlert({
      subject: `Pipeline failure refunded: deck ${deckId}`,
      body: `Deck ${deckId} failed (${failureReason}) and a full refund of $${(paymentRow.amountCents / 100).toFixed(2)} was issued.\n\nStripe session: ${paymentRow.stripeSessionId}\nPayment intent: ${paymentRow.stripePaymentIntentId}\nCustomer email: ${toEmail ?? "(none captured)"}\n\nCheck Sentry for the underlying stack trace.`,
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: {
        surface: "refund_operator_alert",
        deck_id: deckId,
      },
    });
  }
}

async function sendCustomerRefundEmail(toEmail: string): Promise<void> {
  // Reuse sendReportEmail's transport via a separate semantic message — but
  // sendReportEmail is opinionated about the format, so call Resend directly.
  // Importing the Resend client here would create a circular dep risk; the
  // simplest path is to re-use sendOperatorAlert's transport with the
  // customer as the `to`. Cleanest fix is a dedicated helper.
  const { Resend } = await import("resend");
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not configured");
  const resend = new Resend(key);
  const brand = process.env.BRAND_DOMAIN ?? "deckredteam.com";
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || `report@${brand}`;
  const support = `support@${brand}`;

  const result = await resend.emails.send({
    from: `DeckRedTeam <${fromEmail}>`,
    to: toEmail,
    replyTo: support,
    subject: "Refund issued — DeckRedTeam",
    text: `Something went wrong processing your deck. We've been notified and your payment has been refunded automatically.

Refunds typically take 5-10 business days to appear on your card.

If you don't see the refund after that, or you have questions, reply to this email or contact ${support}.

— DeckRedTeam`,
  });
  // Surface stub usage warning if the helper export is reused — keeps the
  // local import constrained.
  void sendReportEmail;
  if ("error" in result && result.error) {
    throw new Error(
      `Resend refund email failed: ${result.error.message ?? "unknown"}`,
    );
  }
}
