import { NextResponse } from "next/server";
import { validateSession } from "@/lib/upload/validate-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const result = await validateSession(sessionId);
  // Only return the kind — callers don't need the full payload.
  return NextResponse.json({ kind: result.kind });
}
