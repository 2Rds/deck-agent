import * as Sentry from "@sentry/nextjs";

const COMMON = {
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  environment: process.env.VERCEL_ENV ?? "development",
} as const;

export async function register() {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    if (process.env.VERCEL_ENV === "production") {
      console.error(
        "[sentry] SENTRY_DSN missing in production — errors will not be reported",
      );
      throw new Error("SENTRY_DSN is required in production");
    }
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({ dsn, ...COMMON });
  } else if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({ dsn, ...COMMON });
  }
}

export const onRequestError = Sentry.captureRequestError;
