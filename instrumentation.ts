// Next.js instrumentation hook. This file is required for @sentry/nextjs v10
// to load the server/edge Sentry configs. Without it, sentry.server.config.ts
// is never imported and server-side errors in API routes are not captured.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown by nested React Server Components and route handlers
// so they are reported to Sentry. Required for Next.js >= 15 / Sentry v10.
export const onRequestError = Sentry.captureRequestError;
