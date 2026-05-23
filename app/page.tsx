import { CtaButton } from "./_components/cta-button";
import { getActivePricing } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

export default function Home() {
  const { introActive, amountCents } = getActivePricing();
  const priceLabel = `$${(amountCents / 100).toFixed(0)}`;
  const brand = process.env.BRAND_DOMAIN ?? "deckredteam.com";
  const supportEmail = `support@${brand}`;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-neutral-900">
      <header className="flex items-baseline justify-between border-b border-neutral-200 pb-6">
        <div className="text-lg font-semibold tracking-tight">
          DeckRedTeam
        </div>
        <a
          href={`mailto:${supportEmail}`}
          className="text-sm text-neutral-600 hover:text-neutral-900"
        >
          {supportEmail}
        </a>
      </header>

      {/* HERO */}
      <section className="pt-16 pb-20">
        <h1 className="text-5xl leading-tight tracking-tight md:text-6xl">
          An investor-grade red team
          <br />
          for your pitch deck.
        </h1>
        <p className="mt-6 max-w-2xl text-xl text-neutral-700">
          Upload your PDF. Get a brutal, math-checked critique within five minutes.
          Catch what a Tier 1 partner will catch in the first 90 seconds — before
          they do.
        </p>
        <div className="mt-10">
          <CtaButton priceLabel={priceLabel} />
          <p className="mt-3 text-sm text-neutral-500">
            One-time payment. No subscription. PDF only —{" "}
            <a className="underline" href="#export-help">
              how to export
            </a>
            .
          </p>
        </div>
        {introActive && (
          <p className="mt-8 inline-flex rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
            Introductory pricing — {priceLabel} this week, $49 standard from next week.
          </p>
        )}
      </section>

      {/* SOCIAL PROOF / EXAMPLE FINDINGS */}
      <section className="border-t border-neutral-200 pt-12 pb-16">
        <h2 className="text-2xl tracking-tight">
          What an actual finding looks like
        </h2>
        <p className="mt-2 text-neutral-600">
          Sanitized examples from real reports. No vague advice. Every claim shows
          its math.
        </p>
        <div className="mt-8 space-y-6">
          <article className="rounded-lg border border-neutral-200 p-5">
            <div className="flex items-center gap-3">
              <span className="rounded-sm bg-red-100 px-2 py-0.5 text-xs font-medium tracking-wide text-red-900 uppercase">
                Critical
              </span>
              <span className="text-sm text-neutral-500">
                Slide 7, Slide 12 — Market Sizing
              </span>
            </div>
            <p className="mt-3 leading-relaxed">
              Slide 7 states TAM $15B and SOM $350M (2.3% of TAM, defensible).
              Slide 12 projects $25M Year 5 ARR — 7.1% of SOM. The continued 18%
              YoY growth through Year 7 implies $58M ARR by Year 7,{" "}
              <span className="font-mono">16.6% of stated SOM in seven years</span>.
              A partner will ask what slows growth after Year 5, or whether your SOM
              is understated.
            </p>
            <p className="mt-3 text-sm text-neutral-600">
              <span className="font-medium">Fix:</span> rebuild SOM bottom-up
              (target units × ACV) so the slope through Y7 doesn&apos;t fold into
              your stated market.
            </p>
          </article>

          <article className="rounded-lg border border-neutral-200 p-5">
            <div className="flex items-center gap-3">
              <span className="rounded-sm bg-amber-100 px-2 py-0.5 text-xs font-medium tracking-wide text-amber-900 uppercase">
                Major
              </span>
              <span className="text-sm text-neutral-500">
                Slide 11 — Team
              </span>
            </div>
            <p className="mt-3 leading-relaxed">
              Three team members listed; two have vague credentials
              (&ldquo;ex-FAANG executive&rdquo;, &ldquo;former Wall Street&rdquo;)
              with no company, role, or year specified. At seed stage, this reads
              as evasive. A partner will ask which company, which role, when.
            </p>
            <p className="mt-3 text-sm text-neutral-600">
              <span className="font-medium">Fix:</span> name the company, the role,
              the years — &ldquo;Engineering Manager at Stripe 2019-2023&rdquo;.
              Specifics build trust; vagueness destroys it.
            </p>
          </article>
        </div>
      </section>

      {/* WHAT YOU GET */}
      <section className="border-t border-neutral-200 pt-12 pb-16">
        <h2 className="text-2xl tracking-tight">What you get</h2>
        <ol className="mt-6 space-y-4">
          {[
            [
              "Executive verdict",
              "A 2-3 sentence brutal honest read on whether this deck will get you to a partner meeting.",
            ],
            [
              "Math + consistency audit",
              "Every TAM/SAM/SOM number, every projection, every traction claim checked. With worked arithmetic on every finding.",
            ],
            [
              "Investor objections to preempt",
              "Five partner personas. Each surfaces the one objection they would raise — tied to a specific slide.",
            ],
            [
              "Structural improvements",
              "Missing slides, wrong slide order, weak hook, buried ask. Concrete reorder recommendations.",
            ],
            [
              "Specific slide rewrites",
              "Before/after on the top 3 problem slides. Not advice — the actual rewritten content.",
            ],
            [
              "Anxiety-targeted analysis",
              "Tell us your biggest worry. We address it directly with slide-specific evidence.",
            ],
          ].map(([title, body]) => (
            <li key={title} className="flex gap-4">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-900" />
              <div>
                <div className="font-medium">{title}</div>
                <div className="text-neutral-700">{body}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-t border-neutral-200 pt-12 pb-16">
        <h2 className="text-2xl tracking-tight">How it works</h2>
        <ol className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            ["1. Pay", "Stripe Checkout. Takes 30 seconds."],
            ["2. Upload", "Drop your PDF and answer 6 short questions about your round."],
            ["3. Report", "Under 5 minutes. Delivered to your email and a private URL."],
          ].map(([step, body]) => (
            <li key={step} className="rounded-md border border-neutral-200 p-4">
              <div className="font-medium">{step}</div>
              <div className="mt-1 text-sm text-neutral-700">{body}</div>
            </li>
          ))}
        </ol>
      </section>

      {/* PDF EXPORT HELP */}
      <section
        id="export-help"
        className="border-t border-neutral-200 pt-12 pb-16"
      >
        <h2 className="text-2xl tracking-tight">PDF only — here&apos;s how to export</h2>
        <p className="mt-2 text-neutral-700">
          We review the deck investors will actually see, which is always a PDF.
          Export from your own tool — fidelity will be higher than any conversion
          we could run.
        </p>
        <div className="mt-6 space-y-2">
          <details className="rounded-md border border-neutral-200 px-4 py-3">
            <summary className="cursor-pointer font-medium">
              PowerPoint (Windows / Mac)
            </summary>
            <p className="mt-2 text-neutral-700">
              File → Save As (or Export) → choose PDF as the file format.
            </p>
          </details>
          <details className="rounded-md border border-neutral-200 px-4 py-3">
            <summary className="cursor-pointer font-medium">Keynote</summary>
            <p className="mt-2 text-neutral-700">
              File → Export To → PDF → choose &ldquo;Best&rdquo; image quality.
            </p>
          </details>
          <details className="rounded-md border border-neutral-200 px-4 py-3">
            <summary className="cursor-pointer font-medium">Google Slides</summary>
            <p className="mt-2 text-neutral-700">
              File → Download → PDF Document (.pdf).
            </p>
          </details>
          <details className="rounded-md border border-neutral-200 px-4 py-3">
            <summary className="cursor-pointer font-medium">Other</summary>
            <p className="mt-2 text-neutral-700">
              Almost every presentation tool can &ldquo;Save as PDF&rdquo; or print
              to PDF. If yours can&apos;t, email {supportEmail} and we&apos;ll help.
            </p>
          </details>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-neutral-200 pt-12 pb-16">
        <h2 className="text-2xl tracking-tight">FAQ</h2>
        <div className="mt-6 space-y-2">
          {[
            [
              "How long does it take?",
              "Under 5 minutes for a typical 12-slide deck. Larger decks take a bit longer. You can close the tab — the report also arrives by email.",
            ],
            [
              "Is my deck shared with anyone?",
              "No. The deck and the report sit in a private R2 bucket. The report URL contains a 32-character access token; only you have it. You can optionally generate a public share URL for a sanitized version that hides your personal context.",
            ],
            [
              "What if the report is bad or the pipeline fails?",
              "If our system fails to produce a complete report, your payment is refunded automatically and we get paged. No tickets to file.",
            ],
            [
              "Can I get a refund if I just don't like the report?",
              "Email us. We'd rather refund unhappy customers than have them tell people the product is bad. But the bar for &lsquo;don&apos;t like it&rsquo; refunds is honest — if the math is right and the findings are specific, the report did its job.",
            ],
            [
              "Who is this for?",
              "Pre-seed and seed founders. Series A works but the analysis calibrates harder.",
            ],
            [
              "Will an investor know I used this?",
              "Only if you tell them. The report is for you, not a deliverable to share with VCs.",
            ],
          ].map(([q, a]) => (
            <details
              key={q}
              className="rounded-md border border-neutral-200 px-4 py-3"
            >
              <summary className="cursor-pointer font-medium">{q}</summary>
              <p
                className="mt-2 text-neutral-700"
                dangerouslySetInnerHTML={{ __html: a }}
              />
            </details>
          ))}
        </div>
      </section>

      {/* CLOSE */}
      <section className="border-t border-neutral-200 pt-12 pb-20">
        <h2 className="text-2xl tracking-tight">Ready?</h2>
        <p className="mt-3 text-neutral-700">
          Five minutes from now you&apos;ll know exactly which slides to fix
          before your next partner meeting.
        </p>
        <div className="mt-6">
          <CtaButton priceLabel={priceLabel} />
        </div>
      </section>

      <footer className="border-t border-neutral-200 py-8 text-sm text-neutral-500">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>© DeckRedTeam</span>
          <a
            href={`mailto:${supportEmail}`}
            className="hover:text-neutral-900"
          >
            {supportEmail}
          </a>
        </div>
      </footer>
    </main>
  );
}
