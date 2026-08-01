import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET|HEAD /api/health: uptime probe for external monitors.
 *
 * Why this exists: an uptime monitor pointed at `/` can get a 200 from a CDN
 * cache while Postgres is unreachable, so a green check means nothing. This
 * route runs on every request (`force-dynamic`, `revalidate = 0`,
 * `Cache-Control: no-store`) and actually touches the one dependency the app
 * cannot serve a request without: its Postgres database.
 *
 * What it checks: a single `select 1` through the app's own connection pool.
 * That is the cheapest query that still proves env config, DNS, TLS, auth and
 * the pool are all working end to end.
 *
 * What it deliberately does NOT do:
 * - No LLM provider or third-party API call. A vendor outage must not redden
 *   this monitor, provider SDK errors routinely carry the API key in their
 *   message, and every probe would cost money.
 * - No submission, run, waitlist or user data: not a row, not a field, not a
 *   count. This app processes other apps' submissions (submitter emails,
 *   names, free-text payloads); a public endpoint must not leak them, nor any
 *   number that implies volume.
 * - No provider or configuration detail. The response shape is fixed and
 *   carries no env-derived value.
 *
 * Failure mode: a fixed literal token. The catch has no binding, so there is
 * no error object in scope to serialize; a connection-string password, a
 * hostname or an env-validation message can never reach the body. The log line
 * records a constant code, never `err.message`.
 */

/** Fixed error token. Never varies with the underlying failure. */
const ERROR_TOKEN = "dependency_unavailable";

/** Hard ceiling on the database probe, so a hung socket cannot hang the monitor. */
const PROBE_TIMEOUT_MS = 4_000;

const NO_STORE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

/**
 * Resolve `promise` or reject after `PROBE_TIMEOUT_MS`. The loser of the race
 * is settled either way: the timer is always cleared, and a late rejection
 * from the probe is swallowed so it cannot surface as an unhandled rejection.
 */
async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("probe_timeout")), PROBE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    void promise.catch(() => {});
  }
}

/** Probe the database. Returns nothing on success, throws on any failure. */
async function checkDatabase(): Promise<void> {
  // Imported dynamically, inside the caller's try: `db/client` reads env
  // through `lib/env.ts`, which throws on a malformed or empty-string value.
  // A config problem must return this route's 503, not a module-scope 500.
  const { getPool } = await import("@/db/client");
  await withTimeout(getPool().query("select 1"));
}

export async function GET(): Promise<NextResponse> {
  try {
    await checkDatabase();
  } catch {
    // No binding on purpose: nothing about the failure can escape from here.
    console.error("[health] probe failed code=%s", ERROR_TOKEN);
    return NextResponse.json(
      { ok: false, error: ERROR_TOKEN },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      service: "witus-triage-agent",
      checks: { database: "ok" },
      time: new Date().toISOString(),
    },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}

/**
 * HEAD /api/health: same probe, no body. Better Stack and most uptime
 * monitors can be configured to use HEAD; without this export Next would
 * answer 405 and the monitor would read the app as permanently down.
 */
export async function HEAD(): Promise<NextResponse> {
  const response = await GET();
  return new NextResponse(null, {
    status: response.status,
    headers: NO_STORE_HEADERS,
  });
}
