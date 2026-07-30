import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

/**
 * Browser runtime error monitoring. Reads the PUBLIC DSN, which is inlined at build time.
 *
 * GUARDED: with `NEXT_PUBLIC_SENTRY_DSN` unset the SDK is inert, so nothing is sent and nothing
 * changes for the operator. Session replay stays at 0 in both modes: the operator dashboard shows
 * other people's submissions on screen, so a replay would record exactly the content this repo's
 * scrubber works to keep out of the payload.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
}

/** Instruments App Router client navigations. A no op when `init()` was skipped. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
