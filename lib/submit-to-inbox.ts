/**
 * Thin wrapper around `sendToInbox` — reads the three `INBOX_*` env vars and
 * falls back to a dev log when any is unset.
 *
 * Reads `process.env` directly (not via `getEnv()`) so the fallback fires in
 * any context — route handler, `after()` continuation — without depending on a
 * separate env getter being initialized first. This file is the only place
 * env-var reads for the outbound Inbox integration live.
 *
 * Note: `INBOX_INGEST_SECRET` (this outbound webhook, agent -> Inbox) is a
 * different secret from `TRIAGE_INGEST_SECRET` (the inbound webhook, Inbox ->
 * agent's /api/triage/start). Two directions, two secrets.
 */
import { sendToInbox, type InboxSubmission } from "./inbox-sender";

export async function submitToInbox(s: InboxSubmission) {
  const url = process.env.INBOX_INGEST_URL;
  const secret = process.env.INBOX_INGEST_SECRET;
  const slug = process.env.INBOX_SOURCE_SLUG;
  if (!url || !secret || !slug) {
    console.log("[inbox] dev-log fallback (env unset):", s.form_type);
    return { ok: false as const, status: 0, detail: "env unset" };
  }
  return sendToInbox({
    inboxUrl: url,
    hmacSecret: secret,
    sourceSlug: slug,
    submission: s,
  });
}
