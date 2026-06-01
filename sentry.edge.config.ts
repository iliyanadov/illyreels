// This file configures the initialization of Sentry for edge runtimes
// (e.g. middleware and edge API routes). The config added here is used
// whenever one of the edge features is loaded.
// Note: Profiling is not available on the edge runtime, so it is omitted.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  tracesSampleRate: 0.1, // Capture 10% of transactions for performance monitoring
  beforeSend(event, hint) {
    // Filter out sensitive data
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers;
    }
    return event;
  },
});
