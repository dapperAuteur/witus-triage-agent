/**
 * Better Stack run heartbeat — silent-death detection for the agent
 * (witus plan 30 §5: the triage agent is a worker, not a website, so an uptime
 * monitor can't see it; a MISSED heartbeat is the dead-run signal).
 *
 * Contract:
 *   - Fires only at the end of a SUCCESSFUL processing run (lib/triage-runner.ts).
 *     Failure paths deliberately do not ping — the silence is the alert.
 *   - Inert without `BETTERSTACK_HEARTBEAT_URL` (same guard pattern as the
 *     Sentry DSN and the Honeycomb key). Read from `process.env` directly, like
 *     the other observability vars, so this stays importable outside getEnv()'s
 *     server-only chain.
 *   - Best-effort: short timeout, all errors swallowed. A down heartbeat
 *     endpoint must never fail (or slow-fail) a triage run.
 *
 * The await is intentional: on Vercel a truly detached fetch can be frozen when
 * the response returns, so the caller awaits this — it just can never throw and
 * can cost at most `timeoutMs`.
 */
export async function pingRunHeartbeat(timeoutMs = 3000): Promise<void> {
  const url = process.env.BETTERSTACK_HEARTBEAT_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // Log the class only; never rethrow.
    const code = err instanceof Error ? err.name : "UnknownError";
    console.warn("[triage] heartbeat ping failed err=%s", code);
  }
}
