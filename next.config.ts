import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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
});
