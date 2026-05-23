"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Hardcoded fallback. The brand domain is server-only via BRAND_DOMAIN; client
// components can't read it without the NEXT_PUBLIC_ prefix. v1 doesn't need
// runtime brand swap; if that changes, expose NEXT_PUBLIC_BRAND_DOMAIN.
const SUPPORT_EMAIL = "support@deckredteam.com";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <main className="mx-auto flex max-w-xl flex-col items-start gap-4 px-6 py-24 text-neutral-900">
      <h1 className="text-3xl tracking-tight">Something went wrong.</h1>
      <p className="text-neutral-700">
        We&rsquo;ve been notified and are looking into it. Try again in a moment, or
        email{" "}
        <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>{" "}
        if it keeps happening.
      </p>
      <button
        onClick={reset}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
      >
        Try again
      </button>
    </main>
  );
}
