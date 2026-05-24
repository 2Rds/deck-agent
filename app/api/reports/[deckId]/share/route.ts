import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db, reports } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generates (or returns the existing) public share token for a report.
 * Auth: the caller must present the private token in the body. Idempotent —
 * repeat calls return the same public URL.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ deckId: string }> },
) {
  const { deckId } = await ctx.params;
  if (!UUID_RE.test(deckId)) {
    return NextResponse.json({ error: "invalid deck id" }, { status: 400 });
  }

  let body: { privateToken?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }
  const privateToken = body.privateToken;
  if (typeof privateToken !== "string" || privateToken.length < 16) {
    return NextResponse.json({ error: "missing privateToken" }, { status: 400 });
  }

  const rows = await db
    .select({
      id: reports.id,
      privateToken: reports.privateToken,
      publicToken: reports.publicToken,
    })
    .from(reports)
    .where(eq(reports.deckId, deckId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (row.privateToken !== privateToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let publicToken = row.publicToken;
  if (!publicToken) {
    publicToken = nanoid(32);
    await db
      .update(reports)
      .set({ publicToken, isPublic: true })
      .where(eq(reports.id, row.id));
  }

  const base = process.env.PUBLIC_BASE_URL ?? "";
  return NextResponse.json({
    publicUrl: `${base}/r/${publicToken}`,
  });
}
