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
