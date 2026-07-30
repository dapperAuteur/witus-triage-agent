import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

/**
 * Edge runtime error monitoring (middleware and any future edge route). Same DSN guard as the
 * server config: inert with `SENTRY_DSN` unset. Loaded by `register()` in `instrumentation.ts`.
 *
 * This repo has no middleware today, so nothing initialises here yet. The file exists so that
 * adding an edge route later does not silently lose its errors.
 */
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
}
