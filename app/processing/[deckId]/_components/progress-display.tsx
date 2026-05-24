"use client";

import { useEffect, useState } from "react";

const SUPPORT_EMAIL = "support@deckredteam.com";
const POLL_INTERVAL_MS = 2000;
// 10 min max — longest expected pipeline is ~5min; double to give Stripe
// webhook + Inngest latency headroom before declaring stuck.
const TIMEOUT_MS = 10 * 60 * 1000;

type ProgressResponse = {
  status: "uploaded" | "processing" | "complete" | "failed";
  slideCount: number | null;
  pipelineProgress: {
    stage_0?: boolean;
    stage_1?: boolean;
    stage_2_pass_2?: boolean;
    stage_2_pass_3?: boolean;
    stage_2_pass_4?: boolean;
    stage_3_pass_5?: boolean;
    stage_3_pass_6?: boolean;
    stage_4?: boolean;
    current_message?: string;
    updated_at?: string;
  };
  failureReason: string | null;
  reportUrl: string | null;
};

type StepStatus = "done" | "active" | "pending";

type StepDef = {
  label: (data: ProgressResponse | null) => string;
  done: (p: ProgressResponse["pipelineProgress"]) => boolean;
};

const STEPS: StepDef[] = [
  {
    label: (data) =>
      data?.slideCount ? `Deck received (${data.slideCount} slides detected)` : "Deck received",
    done: (p) => p.stage_0 === true,
  },
  {
    label: () => "Extracting claims and numbers",
    done: (p) => p.stage_1 === true,
  },
  {
    label: () => "Running math + consistency audit",
    done: (p) => p.stage_2_pass_2 === true,
  },
  {
    label: () => "Generating investor objections",
    done: (p) => p.stage_2_pass_3 === true,
  },
  {
    label: () => "Writing structural analysis",
    done: (p) => p.stage_2_pass_4 === true,
  },
  {
    label: () => "Drafting your rewrites",
    done: (p) => p.stage_3_pass_5 === true,
  },
  {
    label: () => "Finalizing report",
    done: (p) => p.stage_4 === true,
  },
];

function statusFor(
  step: StepDef,
  data: ProgressResponse | null,
  steps: StepDef[],
  i: number,
): StepStatus {
  if (!data) return "pending";
  if (step.done(data.pipelineProgress)) return "done";
  // First step that's not done and previous step IS done → active
  if (i === 0 || steps[i - 1].done(data.pipelineProgress)) return "active";
  return "pending";
}

export function ProgressDisplay({ deckId }: { deckId: string }) {
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    async function poll() {
      while (!cancelled) {
        if (Date.now() - startedAt > TIMEOUT_MS) {
          if (!cancelled) setTimedOut(true);
          return;
        }
        try {
          const res = await fetch(`/api/decks/${deckId}/progress`, {
            cache: "no-store",
          });
          if (!res.ok) {
            if (!cancelled) {
              setError(`progress check returned HTTP ${res.status}`);
            }
            return;
          }
          const body = (await res.json()) as ProgressResponse;
          if (!cancelled) setData(body);
          if (body.status === "complete" && body.reportUrl) {
            window.location.href = body.reportUrl;
            return;
          }
          if (body.status === "failed") {
            return;
          }
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "polling error");
          }
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  if (data?.status === "failed") {
    return (
      <div className="mt-10 rounded-md border border-red-300 bg-red-50 p-5 text-red-900">
        <p className="text-lg font-medium">Something went wrong processing your deck.</p>
        <p className="mt-2">
          Your payment is being refunded automatically and we&rsquo;ve been
          notified. If you don&rsquo;t see a refund within 24 hours, email{" "}
          <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
        {data.failureReason && (
          <p className="mt-3 text-sm">
            Failure code: <code className="font-mono">{data.failureReason}</code>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-10">
      <ol className="space-y-3">
        {STEPS.map((step, i) => {
          const s = statusFor(step, data, STEPS, i);
          const icon = s === "done" ? "✓" : s === "active" ? "⏳" : "○";
          const tone =
            s === "done"
              ? "text-neutral-900"
              : s === "active"
                ? "text-neutral-900"
                : "text-neutral-400";
          return (
            <li key={i} className={`flex items-center gap-3 ${tone}`}>
              <span className="w-5 text-center">{icon}</span>
              <span className={s === "active" ? "font-medium" : ""}>
                {step.label(data)}
              </span>
            </li>
          );
        })}
      </ol>
      {data?.pipelineProgress.current_message && (
        <p className="mt-6 text-sm text-neutral-500">
          {data.pipelineProgress.current_message}
        </p>
      )}
      {timedOut && (
        <div className="mt-8 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <p className="font-medium">Taking longer than usual.</p>
          <p className="mt-1 text-sm">
            Your report is still being processed; the email will arrive when
            it&rsquo;s ready. Email{" "}
            <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>{" "}
            with deck ID{" "}
            <code className="font-mono text-xs">{deckId}</code>{" "}
            if you don&rsquo;t hear back within an hour.
          </p>
        </div>
      )}
      {error && (
        <p className="mt-4 text-sm text-red-700">
          {error}. We&rsquo;ll keep trying — refresh if it persists.
        </p>
      )}
    </div>
  );
}
