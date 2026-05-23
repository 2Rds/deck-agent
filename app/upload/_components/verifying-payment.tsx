"use client";

import { useEffect, useState } from "react";

type Props = {
  sessionId: string;
  supportEmail: string;
};

const POLL_INTERVAL_MS = 1500;
const TIMEOUT_MS = 20_000;

/**
 * Stripe redirects the buyer to /upload immediately on payment success, but
 * the checkout.session.completed webhook is asynchronous and typically lags
 * 1-5s. This screen short-polls the validation endpoint until the webhook
 * lands and the payments row appears. After ~20s we give up and show a
 * contact-support fallback.
 */
export function VerifyingPayment({ sessionId, supportEmail }: Props) {
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          const res = await fetch(
            `/api/upload/session-status?session_id=${encodeURIComponent(sessionId)}`,
            { cache: "no-store" },
          );
          if (res.ok) {
            const { kind } = (await res.json()) as { kind: string };
            if (kind === "ok" || kind === "already_used") {
              // Reload server component to render the form or already-used error.
              window.location.reload();
              return;
            }
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
  }, [sessionId]);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-24 text-neutral-900">
      <h1 className="text-3xl tracking-tight">Verifying your payment…</h1>
      <p className="text-neutral-700">
        Stripe confirmed your payment. We&rsquo;re waiting for the confirmation
        webhook to land — this usually takes a few seconds.
      </p>
      {timedOut && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <p className="font-medium">Still waiting.</p>
          <p className="mt-1 text-sm">
            The webhook is taking longer than usual. Email{" "}
            <a className="underline" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>{" "}
            with this session ID and we&rsquo;ll resolve it:
          </p>
          <code className="mt-2 block text-xs">{sessionId}</code>
        </div>
      )}
      {error && (
        <p className="text-sm text-red-700">
          Polling error: {error}. Refresh the page to retry.
        </p>
      )}
    </main>
  );
}
