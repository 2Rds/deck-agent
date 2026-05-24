import { ProgressDisplay } from "./_components/progress-display";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProcessingPage({
  params,
}: {
  params: Promise<{ deckId: string }>;
}) {
  const { deckId } = await params;
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-neutral-900">
      <header className="border-b border-neutral-200 pb-6">
        <h1 className="text-3xl tracking-tight">Analyzing your deck</h1>
        <p className="mt-2 text-neutral-700">
          Usually under 5 minutes. We&rsquo;ll email you the report when it&rsquo;s ready
          — you can close this tab.
        </p>
      </header>
      <ProgressDisplay deckId={deckId} />
    </main>
  );
}
