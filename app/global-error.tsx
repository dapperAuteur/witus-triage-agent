"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Root error boundary. Catches errors thrown in the root layout itself, which no route level
 * `error.tsx` can reach, and reports them to error monitoring (a no op when no DSN is configured).
 *
 * It renders its own `<html>` / `<body>` because it replaces the root layout, which also means
 * Tailwind is not available here. Styles are inline, using the brand tokens from
 * `app/globals.css` (violet accent on slate) so the page still looks like this app.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#020617",
          color: "#f8fafc",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: "32rem", padding: "1.5rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ color: "#cbd5e1", marginTop: "0.75rem", lineHeight: 1.6 }}>
            The triage dashboard could not load. No submission or approval was changed by this
            error. Try again, and if it keeps happening the error has been reported automatically.
          </p>
          <div
            style={{
              marginTop: "1.25rem",
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: "2.75rem",
                padding: "0 1.25rem",
                borderRadius: "0.5rem",
                border: "none",
                background: "#7c3aed",
                color: "#ffffff",
                fontSize: "1rem",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* The root boundary renders outside the router, so a plain anchor is correct here. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                minHeight: "2.75rem",
                padding: "0.7rem 1.25rem",
                borderRadius: "0.5rem",
                border: "1px solid #475569",
                color: "#f8fafc",
                textDecoration: "none",
                fontSize: "1rem",
              }}
            >
              Back to home
            </a>
          </div>
          {error.digest ? (
            <p style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: "1rem" }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
