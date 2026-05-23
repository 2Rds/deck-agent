import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const isProd = process.env.NODE_ENV === "production";

if (dsn && isProd) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "production",
  });
}

// Fallback no-op so Next never sees an undefined import — Sentry's SDK normally
// provides this as a no-op when init() hasn't run, but versions vary.
export const onRouterTransitionStart =
  Sentry.captureRouterTransitionStart ?? (() => {});
