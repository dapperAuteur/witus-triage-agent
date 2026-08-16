import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

/**
 * Server runtime error monitoring. Loaded by `register()` in `instrumentation.ts` on the Node
 * runtime, which is where every route in this app runs (`export const runtime = "nodejs"`).
 *
 * Vendor: Better Stack, which ingests the standard `@sentry/nextjs` SDK payload. Switching to
 * sentry.io later is a DSN change with no code change.
 *
 * GUARDED ON THE DSN: with `SENTRY_DSN` unset, `init()` never runs and the SDK is inert, so the app
 * behaves exactly as it did before this file existed. See `plans/user-tasks/` for the DSN task.
 */
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Errors only. No tracing spend, and no traces of an LLM agent's inputs, until BAM opts in.
    tracesSampleRate: 0,
    // Tracing belongs to @vercel/otel → Honeycomb (otel.config.ts). Sentry v8+ installs its own
    // OpenTelemetry provider by default even at tracesSampleRate 0; two global providers race and
    // the loser silently drops its spans. Error capture does not need a provider, so skipping
    // Sentry's OTel setup costs nothing here. Same posture as gemini/witus.
    skipOpenTelemetrySetup: true,
    // Never auto attach IP, cookies or user email. `beforeSend` is the second line of defence.
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
}
