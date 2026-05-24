import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, decks, reports } from "@/lib/db/client";
import type { PipelineProgress } from "@/schemas/pipeline-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Polled by /processing/[deckId] every ~2s. Returns the deck's processing
 * status, the pipeline_progress JSONB, and (on complete) the private report
 * URL. Public endpoint — security depends on deckId being an unguessable UUID
 * (same threat model as the report URL itself).
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ deckId: string }> },
) {
  const { deckId } = await ctx.params;
  if (!UUID_RE.test(deckId)) {
    return NextResponse.json({ error: "invalid deck id" }, { status: 400 });
  }

  const rows = await db
    .select({
      status: decks.status,
      slideCount: decks.slideCount,
      pipelineProgress: decks.pipelineProgress,
      failureReason: decks.failureReason,
      privateToken: reports.privateToken,
    })
    .from(decks)
    .leftJoin(reports, eq(reports.deckId, decks.id))
    .where(eq(decks.id, deckId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const progress = (row.pipelineProgress ?? {}) as PipelineProgress;

  const base = process.env.PUBLIC_BASE_URL ?? "";
  const reportUrl =
    row.status === "complete" && row.privateToken
      ? `${base}/report/${deckId}/${row.privateToken}`
      : null;

  return NextResponse.json({
    status: row.status,
    slideCount: row.slideCount,
    pipelineProgress: progress,
    failureReason: row.failureReason,
    reportUrl,
  });
}
