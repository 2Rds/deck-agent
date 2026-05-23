import { NextResponse } from "next/server";
import { validateSessionDbOnly } from "@/lib/upload/validate-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Called every ~1.5s by VerifyingPayment until the Stripe webhook lands and
 * writes the payments row. Uses the DB-only validation path explicitly — see
 * `validateSessionDbOnly` for the rationale (no Stripe API roundtrip per
 * poll; protects against rate-limit DoS).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const result = await validateSessionDbOnly(sessionId);
  return NextResponse.json({ kind: result.kind });
}
