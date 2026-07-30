import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

/**
 * Error monitoring build plugin (Better Stack via the `@sentry/nextjs` SDK).
 *
 * Safe with no monitoring env set: without `SENTRY_AUTH_TOKEN` the plugin simply skips source map
 * upload (you get minified stack traces instead of de minified ones) and the runtime SDK stays
 * inert without a DSN. `org` / `project` / the auth token are read from env so nothing secret is
 * committed here.
 *
 * There is no Content Security Policy in this repo (no `middleware.ts`, no `headers()` here, no
 * `<meta http-equiv>` in the root layout), so no `connect-src` needs the DSN origin appended. If a
 * CSP is added later it must allow the ingest host, and only when a DSN is actually configured.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: {
    // Drops the SDK's own debug logging from the bundle. Replaces the deprecated top level
    // `disableLogger` option.
    treeshake: { removeDebugLogging: true },
  },
});
