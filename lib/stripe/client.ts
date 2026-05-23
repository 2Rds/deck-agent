import Stripe from "stripe";

let cached: { client: Stripe; keyPrefix: string } | null = null;

export function parseCentsEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(
      `${name} must be a non-negative integer (cents); got: ${JSON.stringify(raw)}`,
    );
  }
  return n;
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  const keyPrefix = key.slice(0, 12);
  if (cached && cached.keyPrefix !== keyPrefix) {
    console.warn(
      `[stripe] secret key rotation detected (was ${cached.keyPrefix}, now ${keyPrefix}); recreating client`,
    );
    cached = null;
  }
  if (cached) return cached.client;
  const client = new Stripe(key, {
    apiVersion: "2026-04-22.dahlia",
    typescript: true,
    // Tight per-request timeout. Default SDK is ~80s which holds a Node
    // process slot during Stripe API degradation and exhausts the runtime
    // under any traffic. Callers handle errors by surfacing a generic
    // internal_error to the user, which arrives in a couple seconds.
    timeout: 5_000,
    maxNetworkRetries: 1,
  });
  cached = { client, keyPrefix };
  return client;
}

/**
 * Pricing is controlled by environment variables, not a code deploy. Reads
 * `INTRO_PRICING_END_DATE` and returns whether intro pricing is still active
 * along with the appropriate Stripe Price ID, the active price in cents, and
 * the standard price (for "this week / standard from next week" UI copy).
 */
export function getActivePricing(now: Date = new Date()): {
  introActive: boolean;
  priceId: string;
  amountCents: number;
  standardAmountCents: number;
  introAmountCents: number;
} {
  const endDate = process.env.INTRO_PRICING_END_DATE;
  const introPriceId = process.env.STRIPE_PRICE_ID_INTRO;
  const standardPriceId = process.env.STRIPE_PRICE_ID_STANDARD;
  const introAmountCents = parseCentsEnv("INTRO_PRICE_CENTS", 2900);
  const standardAmountCents = parseCentsEnv("STANDARD_PRICE_CENTS", 4900);

  if (!introPriceId || !standardPriceId) {
    throw new Error(
      "STRIPE_PRICE_ID_INTRO and STRIPE_PRICE_ID_STANDARD must both be set",
    );
  }

  let introActive = false;
  if (endDate) {
    const cutoff = new Date(endDate);
    if (!Number.isFinite(cutoff.getTime())) {
      throw new Error(
        `INTRO_PRICING_END_DATE is not a valid ISO date string: ${JSON.stringify(endDate)}`,
      );
    }
    introActive = now < cutoff;
  }
  return introActive
    ? {
        introActive: true,
        priceId: introPriceId,
        amountCents: introAmountCents,
        introAmountCents,
        standardAmountCents,
      }
    : {
        introActive: false,
        priceId: standardPriceId,
        amountCents: standardAmountCents,
        introAmountCents,
        standardAmountCents,
      };
}
