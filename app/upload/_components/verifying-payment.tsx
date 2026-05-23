"use client";

import { useEffect, useState } from "react";

type Props = {
  sessionId: string;
  supportEmail: string;
};

const POLL_INTERVAL_MS = 1500;
// Stripe webhook delivery typically lands in 1-5s but during incidents can
// take 30s-5min. 90s covers the long tail without stranding the customer
// during normal Stripe operation.
const TIMEOUT_MS = 90_000;

// Any kind that means "the server has a definitive answer; stop polling and
// re-render server component." The form is rendered on `ok`; an error page
// is rendered on the terminal failures.
const TERMINAL_KINDS = new Set([
  "ok",
  "already_used",
  "not_paid",
  "invalid_session_id",
  "missing_session_id",
  "internal_error",
]);

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
          if (!res.ok) {
            // Don't silently keep polling on server errors — surface to user.
            if (!cancelled) {
              setError(`session check returned HTTP ${res.status}`);
            }
            return;
          }
          const { kind } = (await res.json()) as { kind: string };
          if (TERMINAL_KINDS.has(kind)) {
            // Reload so the server component re-renders with the appropriate
            // form / error / already-used page.
            window.location.reload();
            return;
          }
          // kind === "verifying" → keep polling
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
          <p className="font-medium">Still waiting after 90 seconds.</p>
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
          Couldn&rsquo;t check your payment status: {error}. Refresh to retry, or
          email{" "}
          <a className="underline" href={`mailto:${supportEmail}`}>
            {supportEmail}
          </a>
          .
        </p>
      )}
    </main>
  );
}
