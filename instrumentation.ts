import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
      environment: process.env.VERCEL_ENV ?? "development",
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
      environment: process.env.VERCEL_ENV ?? "development",
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
