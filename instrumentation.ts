import * as Sentry from "@sentry/nextjs";

const COMMON = {
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  environment: process.env.VERCEL_ENV ?? "development",
} as const;

export async function register() {
  const dsn = process.env.SENTRY_DSN;
  const runtime = process.env.NEXT_RUNTIME;

  if (!dsn) {
    // Hard-fail only on the Node runtime in production. Throwing inside
    // register() on the edge isolate would be swallowed silently by Next,
    // defeating the purpose of the guard. Edge routes will still skip Sentry
    // init if SENTRY_DSN isn't exposed to the edge runtime, but the Node
    // runtime — which carries the pipeline and refund logic — fails loud.
    if (process.env.VERCEL_ENV === "production" && runtime === "nodejs") {
      console.error(
        "[sentry] SENTRY_DSN missing in production (nodejs) — errors will not be reported",
      );
      throw new Error("SENTRY_DSN is required in production (nodejs runtime)");
    }
    if (process.env.VERCEL_ENV === "production" && runtime === "edge") {
      console.error(
        "[sentry] SENTRY_DSN missing in production (edge runtime) — verify the env var is exposed to edge isolates",
      );
    }
    return;
  }

  if (runtime === "nodejs" || runtime === "edge") {
    Sentry.init({ dsn, ...COMMON });
  }
}

export const onRequestError = Sentry.captureRequestError;
