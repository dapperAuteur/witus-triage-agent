import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

/**
 * Next.js instrumentation hook. Registers Honeycomb OpenTelemetry tracing first, then loads the
 * right Sentry (Better Stack) config per runtime and reports server side App Router errors through
 * `onRequestError`. Everything below is inert without its env var — the Sentry configs guard on
 * `SENTRY_DSN`, the OTel config on the Honeycomb key.
 */
export async function register() {
  // OTel first: it must own the global tracer provider before Sentry loads (Sentry is told to skip
  // its own OTel setup — see skipOpenTelemetrySetup in sentry.server.config.ts). Inert without the
  // Honeycomb key.
  const { registerHoneycombOtel } = await import("./otel.config");
  registerHoneycombOtel();

  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

/**
 * Which surface failed. Worth a tag because the three have different owners and urgency:
 * `webhook` is machine to machine from WitUS Inbox and nobody is watching a screen when it breaks,
 * `api` is the operator dashboard's own fetches, `ui` is a page render. Derived from the route
 * path Next hands us, so there is no DB lookup and no request data in the error path.
 */
function surfaceFor(routePath: string | undefined): "webhook" | "api" | "ui" {
  if (!routePath) return "ui";
  if (routePath.startsWith("/api/triage/start")) return "webhook";
  if (routePath.startsWith("/api/")) return "api";
  return "ui";
}

export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  Sentry.withScope((scope) => {
    scope.setTag("triage.surface", surfaceFor(context?.routePath));
    // `captureRequestError` attaches the route metadata; our `beforeSend` scrub then strips the
    // request body, cookies, auth headers and any credential shaped string before it is sent.
    Sentry.captureRequestError(err, request, context);
  });
};
