import { beforeAll, describe, expect, it } from "vitest";
import * as Sentry from "@sentry/nextjs";

/**
 * Error monitoring must be INERT until BAM sets a DSN. Nothing may initialise, and therefore
 * nothing may be sent, on a checkout that has never seen a Better Stack project. This test pins
 * that: it deletes the DSN vars, imports the real server config, and asserts no client was created.
 *
 * The `delete` matters because the vitest setup loads `.env.local`, so this stays honest even after
 * the DSN is provisioned locally.
 */
describe("error monitoring is inert without a DSN", () => {
  beforeAll(() => {
    delete process.env.SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  });

  it("creates no Sentry client when SENTRY_DSN is unset", async () => {
    await import("../../sentry.server.config");
    expect(Sentry.getClient()).toBeUndefined();
  });

  it("still exposes the scrubber, so the guard is on init and not on the module", async () => {
    const { scrubEvent } = await import("@/lib/sentry-scrub");
    expect(typeof scrubEvent).toBe("function");
  });
});
