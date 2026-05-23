import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getStripe, getActivePricing } from "@/lib/stripe/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const baseUrl = process.env.PUBLIC_BASE_URL;
    if (!baseUrl) {
      Sentry.captureMessage("PUBLIC_BASE_URL not configured", "error");
      return NextResponse.json({ error: "checkout unavailable" }, { status: 500 });
    }

    const { introActive, priceId } = getActivePricing();
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/upload?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/`,
      customer_creation: "always",
      metadata: {
        product: "deckredteam_v1",
        intro_pricing: String(introActive),
      },
      payment_intent_data: {
        metadata: {
          product: "deckredteam_v1",
        },
      },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      Sentry.captureMessage("Stripe returned no checkout URL", "error");
      return NextResponse.json({ error: "checkout unavailable" }, { status: 502 });
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    Sentry.captureException(err, { tags: { surface: "checkout_create" } });
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[checkout] error:", message);
    return NextResponse.json({ error: "checkout unavailable" }, { status: 502 });
  }
}
