"use client";

// This file handles React rendering errors that bubble up to the root.
// It replaces the root layout when triggered, so it must render its own
// <html> and <body>. Errors are forwarded to Sentry.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#react-render-errors-in-app-router

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        {/* `statusCode` is required but irrelevant for client render errors */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
