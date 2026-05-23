import Stripe from "stripe";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  cached = new Stripe(key, {
    apiVersion: "2026-04-22.dahlia",
    typescript: true,
  });
  return cached;
}

/**
 * Pricing is controlled by an environment variable, not a code deploy. Reads
 * `INTRO_PRICING_END_DATE` and returns whether intro pricing is still active
 * along with the appropriate Stripe Price ID and cent amount.
 */
export function getActivePricing(now: Date = new Date()): {
  introActive: boolean;
  priceId: string;
  amountCents: number;
} {
  const endDate = process.env.INTRO_PRICING_END_DATE;
  const introPriceId = process.env.STRIPE_PRICE_ID_INTRO;
  const standardPriceId = process.env.STRIPE_PRICE_ID_STANDARD;
  const introCents = Number(process.env.INTRO_PRICE_CENTS ?? 2900);
  const standardCents = Number(process.env.STANDARD_PRICE_CENTS ?? 4900);

  if (!introPriceId || !standardPriceId) {
    throw new Error(
      "STRIPE_PRICE_ID_INTRO and STRIPE_PRICE_ID_STANDARD must both be set",
    );
  }

  const introActive = !!endDate && now < new Date(endDate);
  return introActive
    ? { introActive: true, priceId: introPriceId, amountCents: introCents }
    : { introActive: false, priceId: standardPriceId, amountCents: standardCents };
}
