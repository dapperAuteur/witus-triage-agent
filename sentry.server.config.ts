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
    // Never auto attach IP, cookies or user email. `beforeSend` is the second line of defence.
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
}
