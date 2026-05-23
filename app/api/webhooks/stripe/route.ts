import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { db, payments } from "@/lib/db/client";
import { eq, ne } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractStripeId(
  ref: string | { id: string } | null | undefined,
): string | null {
  if (typeof ref === "string") return ref;
  return ref?.id ?? null;
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
  // (we set allow_promotion_codes: true). Both count as completed sessions
  // and must produce a payments row so the /upload page can bind to the deck.
  // Any other status (unpaid, pending) should not produce a row.
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

  // Cross-check intro_pricing metadata against amount paid. If they disagree
  // (e.g., a Stripe-Dashboard-created session has no metadata), record a
  // warning rather than corrupt the analytics silently.
  const introCents = Number(process.env.INTRO_PRICE_CENTS ?? 2900);
  const standardCents = Number(process.env.STANDARD_PRICE_CENTS ?? 4900);
  const expectedCents = introPricing ? introCents : standardCents;
  if (
    session.amount_total !== 0 &&
    session.amount_total !== expectedCents &&
    session.amount_total !== introCents &&
    session.amount_total !== standardCents
  ) {
    Sentry.captureMessage("checkout amount does not match any known price", {
      level: "warning",
      tags: {
        stripe_session_id: session.id,
        amount_total: String(session.amount_total),
        intro_pricing: String(introPricing),
      },
    });
  }

  const values = {
    stripeSessionId: session.id,
    stripePaymentIntentId: extractStripeId(session.payment_intent),
    customerEmail: session.customer_details?.email ?? null,
    amountCents: session.amount_total,
    introPricing,
    status: "paid" as const,
  };

  await db
    .insert(payments)
    .values(values)
    .onConflictDoUpdate({
      target: payments.stripeSessionId,
      // Never resurrect a refunded payment back to "paid" if the webhook
      // gets re-delivered after a refund completed.
      setWhere: ne(payments.status, "refunded"),
      set: values,
    });
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  console.warn(
    `[webhook] payment_intent.payment_failed pi=${paymentIntent.id} reason=${paymentIntent.last_payment_error?.message ?? "unknown"}`,
  );
  Sentry.captureMessage("Stripe payment failed", {
    level: "warning",
    tags: { payment_intent_id: paymentIntent.id },
    extra: {
      last_payment_error: paymentIntent.last_payment_error,
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
  const result = await db
    .update(payments)
    .set({ status: "refunded" })
    .where(eq(payments.stripePaymentIntentId, paymentIntentId))
    .returning({ id: payments.id });

  if (result.length === 0) {
    // No row matched. This is a real silent-failure risk — the customer's
    // refund landed in Stripe but we don't reflect it. Throw so Stripe retries
    // and Sentry surfaces it.
    throw new Error(
      `charge.refunded matched zero payments rows (pi=${paymentIntentId}, charge=${charge.id})`,
    );
  }
}

