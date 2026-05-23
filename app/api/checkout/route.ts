import { NextResponse } from "next/server";
import { getStripe, getActivePricing } from "@/lib/stripe/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const baseUrl = process.env.PUBLIC_BASE_URL;
  if (!baseUrl) {
    return NextResponse.json(
      { error: "PUBLIC_BASE_URL is not configured" },
      { status: 500 },
    );
  }

  const { introActive, priceId } = getActivePricing();
  const stripe = getStripe();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/upload?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/`,
      customer_creation: "always",
      metadata: {
        product: "deckredteam_v1",
        intro_pricing: introActive ? "true" : "false",
      },
      payment_intent_data: {
        metadata: {
          product: "deckredteam_v1",
        },
      },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL" },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[checkout] Stripe error:", message);
    return NextResponse.json({ error: "checkout creation failed" }, { status: 502 });
  }
}
