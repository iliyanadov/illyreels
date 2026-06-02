import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // These downloader libs use dynamic require() internally, which the bundler
  // can't trace ("Cannot find module as expression is too dynamic"). Keep them
  // external so they're loaded from node_modules at runtime in the function.
  serverExternalPackages: ['ruhend-scraper', 'btch-downloader', 'instagram-url-direct'],
  // ruhend-scraper requires cheerio/node-fetch via paths the tracer can't
  // follow, so force-include their dependency trees into the download function.
  outputFileTracingIncludes: {
    '/api/download': [
      // ruhend nests some deps under its own node_modules — grab the whole tree.
      './node_modules/ruhend-scraper/**',
      './node_modules/tslib/**',
      './node_modules/cheerio/**',
      './node_modules/cheerio-select/**',
      './node_modules/css-select/**',
      './node_modules/css-what/**',
      './node_modules/boolbase/**',
      './node_modules/nth-check/**',
      './node_modules/dom-serializer/**',
      './node_modules/domelementtype/**',
      './node_modules/domhandler/**',
      './node_modules/domutils/**',
      './node_modules/entities/**',
      './node_modules/htmlparser2/**',
      './node_modules/parse5/**',
      './node_modules/parse5-htmlparser2-tree-adapter/**',
      './node_modules/node-fetch/**',
      './node_modules/whatwg-url/**',
      './node_modules/tr46/**',
      './node_modules/webidl-conversions/**',
    ],
  },
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
