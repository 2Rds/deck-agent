import type { Pass1Output } from "@/schemas/pass-1-output";
import type { Pass2Output, Issue } from "@/schemas/pass-2-output";
import type { Pass3Output, Objection } from "@/schemas/pass-3-output";
import type { Pass4Output } from "@/schemas/pass-4-output";
import type { Pass5Output } from "@/schemas/pass-5-output";
import type { Pass6Output } from "@/schemas/pass-6-output";

export type ReportContentProps = {
  mode: "private" | "public";
  deck: {
    stage: string;
    roundAmountNormalized: string;
    instrument: string;
    biggestWorry: string | null;
    createdAt: Date | string;
  };
  report: {
    pass1Output: Pass1Output[] | null;
    pass2Output: Pass2Output | null;
    pass3Output: Pass3Output | null;
    pass4Output: Pass4Output | null;
    pass5Output: Pass5Output | null;
    pass6Output: Pass6Output | null;
  };
  shareControl?: React.ReactNode;
};

function pickDeckTitle(pass1: Pass1Output[] | null): string {
  if (!pass1 || pass1.length === 0) return "Your Pitch Deck Red Team";
  const cover = pass1.find((s) => s.slide_type === "cover") ?? pass1[0];
  return cover.headline ?? "Your Pitch Deck Red Team";
}

function formatAmount(raw: string): string {
  // raw is something like "1,500,000" from normalizeRoundAmount
  return `$${raw}`;
}

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function SeverityBadge({ severity }: { severity: "critical" | "major" | "minor" }) {
  const map = {
    critical: "bg-red-100 text-red-900",
    major: "bg-amber-100 text-amber-900",
    minor: "bg-neutral-100 text-neutral-700",
  } as const;
  return (
    <span
      className={`rounded-sm px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${map[severity]}`}
    >
      {severity}
    </span>
  );
}

function SlideRefs({ slides }: { slides: number[] }) {
  if (slides.length === 0) return null;
  return (
    <span className="text-sm text-neutral-600">
      Slide{slides.length > 1 ? "s" : ""} {slides.join(", ")}
    </span>
  );
}

function IssueCard({
  issue,
  severity,
}: {
  issue: Issue;
  severity: "critical" | "major" | "minor";
}) {
  return (
    <article className="rounded-lg border border-neutral-200 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <SeverityBadge severity={severity} />
        <SlideRefs slides={issue.slide_references} />
        <span className="text-xs uppercase tracking-wide text-neutral-500">
          {issue.category.replace(/_/g, " ").toLowerCase()}
        </span>
      </div>
      <p className="mt-3 leading-relaxed">{issue.issue}</p>
      {issue.math_shown && (
        <pre className="mt-3 overflow-x-auto rounded-md bg-neutral-50 p-3 font-mono text-sm">
          {issue.math_shown}
        </pre>
      )}
      <p className="mt-3 text-sm">
        <span className="font-medium">Why it matters: </span>
        <span className="text-neutral-700">{issue.why_it_matters}</span>
      </p>
      <p className="mt-2 text-sm">
        <span className="font-medium">Fix: </span>
        <span className="text-neutral-700">{issue.suggested_fix}</span>
      </p>
    </article>
  );
}

function ObjectionCard({ objection }: { objection: Objection }) {
  return (
    <article className="rounded-lg border border-neutral-200 p-5">
      <div className="flex items-center gap-3">
        <h3 className="text-base font-medium">{objection.persona}</h3>
        <span className="text-sm text-neutral-500">
          Triggered by slide {objection.slide_trigger}
        </span>
      </div>
      <blockquote className="mt-3 border-l-2 border-neutral-300 pl-3 italic text-neutral-800">
        &ldquo;{objection.objection}&rdquo;
      </blockquote>
      <p className="mt-3 text-sm">
        <span className="font-medium">How to preempt: </span>
        <span className="text-neutral-700">{objection.how_to_preempt}</span>
      </p>
    </article>
  );
}

export function ReportContent({
  mode,
  deck,
  report,
  shareControl,
}: ReportContentProps) {
  const { pass1Output, pass2Output, pass3Output, pass4Output, pass5Output, pass6Output } =
    report;

  const title = pickDeckTitle(pass1Output);
  const showPersonalContext = mode === "private";

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-neutral-900">
      <header className="border-b border-neutral-200 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl tracking-tight md:text-4xl">{title}</h1>
            {showPersonalContext && (
              <p className="mt-2 text-neutral-600">
                {deck.stage} · {formatAmount(deck.roundAmountNormalized)}{" "}
                {deck.instrument}
              </p>
            )}
            <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
              Generated {formatDate(deck.createdAt)}
            </p>
          </div>
          {shareControl}
        </div>
      </header>

      {/* EXECUTIVE VERDICT */}
      {pass2Output?.executive_verdict && (
        <section className="border-b border-neutral-200 py-10">
          <h2 className="text-sm uppercase tracking-wide text-neutral-500">
            Executive verdict
          </h2>
          <p className="mt-4 text-xl leading-relaxed">
            {pass2Output.executive_verdict}
          </p>
        </section>
      )}

      {/* CRITICAL ISSUES */}
      {pass2Output && pass2Output.critical_issues.length > 0 && (
        <section className="border-b border-neutral-200 py-10">
          <h2 className="text-2xl tracking-tight">Critical issues</h2>
          <div className="mt-6 space-y-4">
            {pass2Output.critical_issues.map((issue, i) => (
              <IssueCard key={i} issue={issue} severity="critical" />
            ))}
          </div>
        </section>
      )}

      {/* MAJOR ISSUES */}
      {pass2Output && pass2Output.major_issues.length > 0 && (
        <section className="border-b border-neutral-200 py-10">
          <h2 className="text-2xl tracking-tight">Major issues</h2>
          <div className="mt-6 space-y-4">
            {pass2Output.major_issues.map((issue, i) => (
              <IssueCard key={i} issue={issue} severity="major" />
            ))}
          </div>
        </section>
      )}

      {/* MINOR ISSUES (collapsible) */}
      {pass2Output && pass2Output.minor_issues.length > 0 && (
        <section className="border-b border-neutral-200 py-10">
          <details>
            <summary className="cursor-pointer text-2xl tracking-tight">
              Show {pass2Output.minor_issues.length} minor issue
              {pass2Output.minor_issues.length === 1 ? "" : "s"}
            </summary>
            <div className="mt-6 space-y-4">
              {pass2Output.minor_issues.map((issue, i) => (
                <IssueCard key={i} issue={issue} severity="minor" />
              ))}
            </div>
          </details>
        </section>
      )}

      {/* INVESTOR OBJECTIONS */}
      {pass3Output && pass3Output.objections.length > 0 && (
        <section className="border-b border-neutral-200 py-10">
          <h2 className="text-2xl tracking-tight">Investor objections to preempt</h2>
          <p className="mt-2 text-neutral-700">
            Five partner personas. Each represents the most likely objection from
            that lens.
          </p>
          <div className="mt-6 space-y-4">
            {pass3Output.objections.map((o, i) => (
              <ObjectionCard key={i} objection={o} />
            ))}
          </div>
        </section>
      )}

      {/* STRUCTURAL IMPROVEMENTS */}
      {pass4Output && (
        <section className="border-b border-neutral-200 py-10">
          <h2 className="text-2xl tracking-tight">Structural improvements</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Slide count assessment:{" "}
            <span className="font-medium">{pass4Output.slide_count_assessment.replace(/_/g, " ")}</span>
            . Hook: <span className="font-medium">{pass4Output.hook_assessment.strength}</span>.
          </p>
          {pass4Output.missing_slides.length > 0 && (
            <div className="mt-5">
              <h3 className="text-base font-medium">Missing slides</h3>
              <ul className="mt-2 space-y-2">
                {pass4Output.missing_slides.map((m, i) => (
                  <li key={i} className="flex gap-3 text-neutral-700">
                    <SeverityBadge severity={m.severity} />
                    <span>
                      <span className="font-medium capitalize">{m.category}: </span>
                      {m.rationale}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pass4Output.slide_order_recommendations.length > 0 && (
            <div className="mt-5">
              <h3 className="text-base font-medium">Slide order recommendations</h3>
              <ul className="mt-2 space-y-2 text-neutral-700">
                {pass4Output.slide_order_recommendations.map((r, i) => (
                  <li key={i}>
                    Move slide {r.current_position} → position {r.recommended_position}: {r.rationale}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pass4Output.redundant_slides.length > 0 && (
            <div className="mt-5">
              <h3 className="text-base font-medium">Slides to consider removing</h3>
              <ul className="mt-2 space-y-2 text-neutral-700">
                {pass4Output.redundant_slides.map((r, i) => (
                  <li key={i}>
                    Slide {r.slide_number}: {r.rationale}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-5 text-sm text-neutral-700">
            <span className="font-medium">Ask placement: </span>
            {pass4Output.ask_placement_assessment.notes}
          </p>
        </section>
      )}

      {/* SPECIFIC REWRITES */}
      {pass5Output && pass5Output.rewrites.length > 0 && (
        <section className="border-b border-neutral-200 py-10">
          <h2 className="text-2xl tracking-tight">Specific slide rewrites</h2>
          <div className="mt-6 space-y-6">
            {pass5Output.rewrites.map((r, i) => (
              <article
                key={i}
                className="rounded-lg border border-neutral-200 p-5"
              >
                <div className="text-sm uppercase tracking-wide text-neutral-500">
                  Slide {r.slide_number}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
                    <div className="text-xs uppercase tracking-wide text-neutral-500">
                      Current
                    </div>
                    <p className="mt-2 leading-relaxed">{r.current_version}</p>
                  </div>
                  <div className="rounded-md border border-neutral-300 bg-amber-50 p-4">
                    <div className="text-xs uppercase tracking-wide text-amber-900">
                      Rewrite
                    </div>
                    <p className="mt-2 leading-relaxed">{r.rewritten_version}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm">
                  <span className="font-medium">Why this is better: </span>
                  <span className="text-neutral-700">{r.rationale}</span>
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* PASS 6 — personal concern, private only */}
      {showPersonalContext && pass6Output && deck.biggestWorry && (
        <section className="border-b border-neutral-200 py-10">
          <h2 className="text-sm uppercase tracking-wide text-neutral-500">
            You told us you&rsquo;re worried about
          </h2>
          <p className="mt-2 italic text-neutral-800">&ldquo;{deck.biggestWorry}&rdquo;</p>
          <div className="mt-6">
            <p className="font-medium capitalize">
              Our assessment: {pass6Output.assessment}
            </p>
            <p className="mt-2 text-neutral-700">
              {pass6Output.assessment_reasoning}
            </p>
            {pass6Output.slide_evidence.length > 0 && (
              <div className="mt-4">
                <h3 className="text-base font-medium">Evidence from your deck</h3>
                <ul className="mt-2 space-y-3 text-neutral-700">
                  {pass6Output.slide_evidence.map((e, i) => (
                    <li key={i}>
                      <span className="font-medium">Slide {e.slide_number}: </span>
                      {e.what_the_slide_does}.{" "}
                      <span className="text-neutral-600">{e.relevance_to_worry}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {pass6Output.specific_action_items.length > 0 && (
              <div className="mt-4">
                <h3 className="text-base font-medium">What to do about it</h3>
                <ul className="mt-2 space-y-2 text-neutral-700">
                  {pass6Output.specific_action_items.map((a, i) => (
                    <li key={i}>
                      {a.slide_reference !== null && (
                        <span className="font-medium">Slide {a.slide_reference}: </span>
                      )}
                      {a.action}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* WHAT THE DECK DOES WELL */}
      {pass2Output && pass2Output.what_the_deck_does_well.length > 0 && (
        <section className="border-b border-neutral-200 py-10">
          <h2 className="text-2xl tracking-tight">What the deck does well</h2>
          <ul className="mt-4 space-y-3 text-neutral-700">
            {pass2Output.what_the_deck_does_well.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-900" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="py-8 text-sm text-neutral-500">
        <p>Generated by DeckRedTeam.</p>
        <p className="mt-1">
          <a className="underline" href="/">
            Want another deck reviewed?
          </a>
        </p>
      </footer>
    </main>
  );
}
