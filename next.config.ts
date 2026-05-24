import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

if (
  process.env.VERCEL_ENV === "production" &&
  !process.env.SENTRY_AUTH_TOKEN
) {
  throw new Error(
    "SENTRY_AUTH_TOKEN is required for production builds (source map upload)",
  );
}

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "30mb",
    },
  },
  // The Inngest pipeline reads the source-of-truth prompt markdown files at
  // runtime via fs.readFileSync. Vercel's file tracing doesn't see fs reads,
  // so we explicitly include /prompts in the function bundle.
  outputFileTracingIncludes: {
    "/api/inngest": ["./prompts/**/*"],
  },
};

export default withSentryConfig(nextConfig, {
  org: "2rds-innovative-solutions-llc",
  project: "javascript-nextjs",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
