"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * `global-error.tsx` catches errors thrown in the root layout (next/font
 * loaders, Sentry init failure, root metadata, etc.) that `error.tsx`
 * cannot. Next 16 requires its own <html>/<body> shell because the layout
 * failed to render.
 */
const SUPPORT_EMAIL = "support@deckredteam.com";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      extra: { digest: error.digest, surface: "global-error" },
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: "6rem 1.5rem",
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: "#fdfcf9",
          color: "#0f0f10",
        }}
      >
        <main
          style={{
            maxWidth: "32rem",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <h1 style={{ fontSize: "1.875rem", margin: 0 }}>
            DeckRedTeam is temporarily unavailable.
          </h1>
          <p style={{ color: "#404040" }}>
            We&rsquo;ve been notified. Please try again in a few minutes, or
            email{" "}
            <a
              style={{ color: "inherit", textDecoration: "underline" }}
              href={`mailto:${SUPPORT_EMAIL}`}
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </main>
      </body>
    </html>
  );
}
