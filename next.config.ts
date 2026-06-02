import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // These downloader libs use dynamic require() internally, which the bundler
  // can't trace ("Cannot find module as expression is too dynamic"). Keep them
  // external so they're loaded from node_modules at runtime in the function.
  serverExternalPackages: ['ruhend-scraper', 'btch-downloader', 'instagram-url-direct'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.tikwm.com' },
      { protocol: 'https', hostname: '**.tiktokcdn.com' },
      { protocol: 'https', hostname: '**.tiktokv.com' },
      { protocol: 'https', hostname: '**.tiktokcdn-us.com' },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  // Configure SentryWebpackPlugin options
  silent: true, // Suppresses all logs
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Configure source maps upload
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
