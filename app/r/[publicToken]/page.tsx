import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, decks, reports } from "@/lib/db/client";
import { ReportContent } from "@/app/report/_components/report-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  if (!publicToken || publicToken.length < 16) {
    notFound();
  }

  const rows = await db
    .select({
      deck: decks,
      report: reports,
    })
    .from(reports)
    .innerJoin(decks, eq(decks.id, reports.deckId))
    .where(and(eq(reports.publicToken, publicToken), eq(reports.isPublic, true)))
    .limit(1);

  const row = rows[0];
  if (!row || row.deck.status !== "complete") {
    notFound();
  }

  return (
    <ReportContent
      mode="public"
      deck={{
        stage: row.deck.stage,
        roundAmountNormalized: row.deck.roundAmountNormalized,
        instrument: row.deck.instrument,
        biggestWorry: null, // hidden in public mode
        createdAt: row.deck.createdAt,
      }}
      report={{
        pass1Output: row.report.pass1Output ?? null,
        pass2Output: row.report.pass2Output ?? null,
        pass3Output: row.report.pass3Output ?? null,
        pass4Output: row.report.pass4Output ?? null,
        pass5Output: row.report.pass5Output ?? null,
        // Pass 6 omitted in public mode regardless
        pass6Output: null,
      }}
    />
  );
}
