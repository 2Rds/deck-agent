import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { getStripe, parseCentsEnv } from "@/lib/stripe/client";
import { db, payments } from "@/lib/db/client";
import { eq, ne } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractStripeId<T extends { id: string }>(
  ref: string | T | null | undefined,
): string | null {
  return typeof ref === "string" ? ref : (ref?.id ?? null);
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing stripe-signature" }, { status: 400 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    Sentry.captureMessage("STRIPE_WEBHOOK_SECRET not configured", "error");
    return NextResponse.json({ error: "webhook not configured" }, { status: 500 });
  }

  const body = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown signature error";
    console.warn("[webhook] signature verification failed:", message);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;
      case "charge.refunded":
        await handleChargeRefunded(event.data.object);
        break;
      default:
        // Unsubscribed event types — ack and ignore.
        break;
    }
  } catch (err) {
    console.error(`[webhook] handler failed for ${event.type}:`, err);
    Sentry.captureException(err, {
      tags: { stripe_event_type: event.type, stripe_event_id: event.id },
    });
    // 500 so Stripe retries with backoff
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const status = session.payment_status;
  // "paid" = standard happy path. "no_payment_required" = a 100%-off promo code
  // (we set allow_promotion_codes: true). Both count as completed sessions and
  // must produce a payments row so the /upload page can bind to the deck.
  if (status !== "paid" && status !== "no_payment_required") {
    Sentry.captureMessage("checkout.session.completed with unexpected status", {
      level: "warning",
      tags: { stripe_session_id: session.id, payment_status: status ?? "missing" },
    });
    return;
  }

  // amount_total can be null in some session states. Don't silently record $0;
  // throw so Stripe retries and Sentry alerts.
  if (session.amount_total === null || session.amount_total === undefined) {
    throw new Error(
      `checkout.session.completed missing amount_total for session ${session.id}`,
    );
  }

  const introPricing = session.metadata?.intro_pricing === "true";
  const customerEmail = session.customer_details?.email ?? null;

  // Use the shared cents-validation helper rather than bare Number() to avoid
  // silent NaN/0 on malformed env vars.
  const introCents = parseCentsEnv("INTRO_PRICE_CENTS", 2900);
  const standardCents = parseCentsEnv("STANDARD_PRICE_CENTS", 4900);
  const expectedCents = introPricing ? introCents : standardCents;
  const discountCents = session.total_details?.amount_discount ?? 0;

  // Tier-spoofing defense-in-depth: the pre-discount amount (amount_paid +
  // discount) must equal the tier price the metadata claims. Covers both
  // full-price and partial-promo paths. Skip only for `no_payment_required`
  // (100%-off promo, amount_total === 0 AND discount === expectedCents).
  const grossCents = session.amount_total + discountCents;
  const isFullPromo = session.amount_total === 0 && discountCents === expectedCents;
  if (!isFullPromo && grossCents !== expectedCents) {
    Sentry.captureMessage("checkout gross amount does not match metadata tier", {
      level: "warning",
      tags: {
        stripe_session_id: session.id,
        amount_total: String(session.amount_total),
        discount: String(discountCents),
        expected: String(expectedCents),
        intro_pricing: String(introPricing),
      },
    });
  }

  // Surface paid sessions that lack a customer email — Stage D email delivery
  // will need a fallback path for these.
  if (status === "paid" && !customerEmail) {
    Sentry.captureMessage("paid checkout session has no customer_email", {
      level: "warning",
      tags: { stripe_session_id: session.id },
    });
  }

  const values = {
    stripeSessionId: session.id,
    stripePaymentIntentId: extractStripeId(session.payment_intent),
    customerEmail,
    amountCents: session.amount_total,
    introPricing,
    status: "paid" as const,
  };

  const result = await db
    .insert(payments)
    .values(values)
    .onConflictDoUpdate({
      target: payments.stripeSessionId,
      // Never resurrect a refunded payment back to "paid" if a re-delivered
      // checkout.session.completed event arrives after a refund.
      setWhere: ne(payments.status, "refunded"),
      set: values,
    })
    .returning({ id: payments.id });

  // 0 rows = the row exists and the setWhere predicate excluded the UPDATE.
  // Most common cause is a re-delivered checkout.session.completed event for
  // a row already flipped to "refunded"; in principle other future states
  // could trigger this too, so the message stays cause-neutral and the
  // operator should verify against the actual row.
  if (result.length === 0) {
    Sentry.captureMessage(
      "checkout.session.completed upsert skipped by setWhere; verify payments row state",
      {
        level: "info",
        tags: { stripe_session_id: session.id },
      },
    );
  }
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  // Carefully redact PII from the error payload. last_payment_error contains
  // billing_details with email/name/address that must not ship to Sentry.
  const err = paymentIntent.last_payment_error;
  const safeError = err
    ? {
        code: err.code,
        decline_code: err.decline_code,
        type: err.type,
        message: err.message,
      }
    : null;

  console.warn(
    `[webhook] payment_intent.payment_failed pi=${paymentIntent.id} code=${err?.code ?? "unknown"}`,
  );
  Sentry.captureMessage("Stripe payment failed", {
    level: "warning",
    tags: { payment_intent_id: paymentIntent.id },
    extra: {
      last_payment_error: safeError,
      amount: paymentIntent.amount,
    },
  });
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId = extractStripeId(charge.payment_intent);
  if (!paymentIntentId) {
    Sentry.captureMessage("charge.refunded had no payment_intent", {
      level: "warning",
      tags: { charge_id: charge.id },
    });
    return;
  }

  // Distinguish full from partial refunds. Stripe fires charge.refunded for
  // both, but flipping status to "refunded" for a partial would lock the
  // customer out of their already-delivered report. v1 expects only full
  // refunds via the operator-triggered refund path; partials are operator
  // goodwill and shouldn't change access.
  const isFullRefund = charge.amount_refunded === charge.amount;
  if (!isFullRefund) {
    Sentry.captureMessage("partial refund — status unchanged", {
      level: "info",
      tags: {
        charge_id: charge.id,
        payment_intent_id: paymentIntentId,
        amount: String(charge.amount),
        amount_refunded: String(charge.amount_refunded),
      },
    });
    return;
  }

  const result = await db
    .update(payments)
    .set({ status: "refunded" })
    .where(eq(payments.stripePaymentIntentId, paymentIntentId))
    .returning({ id: payments.id });

  if (result.length === 0) {
    // No row matched. This is a real silent-failure risk — the refund landed
    // in Stripe but our DB doesn't reflect it. Throw so Stripe retries and
    // Sentry surfaces it for operator action.
    throw new Error(
      `charge.refunded matched zero payments rows (pi=${paymentIntentId}, charge=${charge.id})`,
    );
  }
}
