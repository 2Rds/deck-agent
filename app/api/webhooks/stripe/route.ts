import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { db, payments } from "@/lib/db/client";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing stripe-signature" }, { status: 400 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET not configured");
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
  if (session.payment_status !== "paid") {
    return;
  }
  const amountCents = session.amount_total ?? 0;
  const introPricing = session.metadata?.intro_pricing === "true";
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  await db
    .insert(payments)
    .values({
      stripeSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      amountCents,
      introPricing,
      status: "paid",
    })
    .onConflictDoUpdate({
      target: payments.stripeSessionId,
      set: {
        stripePaymentIntentId: paymentIntentId,
        amountCents,
        introPricing,
        status: "paid",
      },
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
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id ?? null;
  if (!paymentIntentId) {
    console.warn(`[webhook] charge.refunded had no payment_intent: ${charge.id}`);
    return;
  }
  await db
    .update(payments)
    .set({ status: "refunded" })
    .where(eq(payments.stripePaymentIntentId, paymentIntentId));
}
