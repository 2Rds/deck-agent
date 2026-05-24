import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, decks, reports } from "@/lib/db/client";
import { ReportContent } from "@/app/report/_components/report-content";
import { ShareButton } from "@/app/report/_components/share-button";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PrivateReportPage({
  params,
}: {
  params: Promise<{ deckId: string; token: string }>;
}) {
  const { deckId, token } = await params;

  const rows = await db
    .select({
      deck: decks,
      report: reports,
    })
    .from(decks)
    .leftJoin(reports, eq(reports.deckId, decks.id))
    .where(eq(decks.id, deckId))
    .limit(1);

  const row = rows[0];
  if (!row || !row.report || row.report.privateToken !== token) {
    notFound();
  }

  if (row.deck.status === "processing" || row.deck.status === "uploaded") {
    // Pipeline still running; bounce to /processing
    redirect(`/processing/${deckId}`);
  }

  if (row.deck.status === "failed") {
    return (
      <main className="mx-auto max-w-xl px-6 py-24 text-neutral-900">
        <h1 className="text-3xl tracking-tight">
          This deck&rsquo;s analysis didn&rsquo;t complete.
        </h1>
        <p className="mt-3 text-neutral-700">
          We&rsquo;ve been notified and your payment is being refunded. Email{" "}
          <a className="underline" href="mailto:support@deckredteam.com">
            support@deckredteam.com
          </a>{" "}
          if you don&rsquo;t see a refund within 24 hours.
        </p>
        {row.deck.failureReason && (
          <p className="mt-3 text-sm text-neutral-500">
            Failure code: <code className="font-mono">{row.deck.failureReason}</code>
          </p>
        )}
      </main>
    );
  }

  const base = process.env.PUBLIC_BASE_URL ?? "";
  const initialPublicUrl = row.report.publicToken
    ? `${base}/r/${row.report.publicToken}`
    : null;

  return (
    <ReportContent
      mode="private"
      deck={{
        stage: row.deck.stage,
        roundAmountNormalized: row.deck.roundAmountNormalized,
        instrument: row.deck.instrument,
        biggestWorry: row.deck.biggestWorry,
        createdAt: row.deck.createdAt,
      }}
      report={{
        pass1Output: row.report.pass1Output ?? null,
        pass2Output: row.report.pass2Output ?? null,
        pass3Output: row.report.pass3Output ?? null,
        pass4Output: row.report.pass4Output ?? null,
        pass5Output: row.report.pass5Output ?? null,
        pass6Output: row.report.pass6Output ?? null,
      }}
      shareControl={
        <ShareButton
          deckId={deckId}
          privateToken={token}
          initialPublicUrl={initialPublicUrl}
        />
      }
    />
  );
}
