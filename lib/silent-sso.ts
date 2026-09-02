/**
 * Ecosystem SSO helpers: the silent "Continue as <name>" check, and the URL that
 * ends the SHARED WitUS session on sign-out.
 *
 * WHY A CROSS-ORIGIN PROBE. Signing in here sends the operator to
 * accounts.witus.online even when another tab already has them signed in to a
 * WitUS app. BAM chose (2026-08-30) to render the sign-in form immediately and
 * ask the question IN PARALLEL, rather than redirect automatically: the form is
 * never delayed, and an automatic redirect is what creates loops. OIDC
 * `prompt=none` would answer the same question, but it is a NAVIGATION — you
 * leave the page to ask — so we ask a dedicated IdP endpoint over CORS instead.
 *
 * WHAT IT BUYS AND WHAT IT DOES NOT. The probe carries the IdP's cookie as a
 * THIRD-PARTY cookie, so it answers on Chrome/Edge and returns nothing under
 * Safari ITP or Firefox Total Cookie Protection. That is the design, not a bug:
 * a probe that answers nothing renders nothing and the operator keeps exactly
 * the sign-in page they already had.
 *
 * THE IDENTITY THIS RETURNS IS DISPLAY COPY, NEVER A CREDENTIAL. It arrives
 * from another origin, so it is client-supplied by definition. It must never
 * gate access, populate a session, or be sent anywhere. Clicking the button
 * runs the real OIDC code flow, which is the only thing that establishes
 * identity — and the `signIn` callback in `lib/auth.ts` still enforces the
 * single-operator ADMIN_EMAIL gate on top of that.
 *
 * NO `server-only` HERE. These are pure functions with no `process.env`, no
 * `next/headers`, and no `window` at module scope, so the client component and
 * the Vitest suite can both import them. The server-only resolution of the
 * actual URLs lives in `lib/env.ts`.
 */

/** Query param that marks "this browser already tried the ecosystem flow on this page". */
export const SSO_ATTEMPT_PARAM = "sso";
export const SSO_ATTEMPT_VALUE = "tried";

/**
 * sessionStorage key for the same marker. Written IMMEDIATELY BEFORE we send
 * the browser to the IdP, never after it comes back: a marker written on return
 * is a marker that does not exist when the return is the thing that failed.
 */
export const SSO_ATTEMPT_STORAGE_KEY = "witus.sso.attempted";

/** How long to wait for the probe before giving up. A silent check that hangs is a broken page. */
export const SILENT_SSO_TIMEOUT_MS = 4000;

/** Longest display name we will render. Caps a hostile or absurd value from blowing up the card. */
const MAX_LABEL_LENGTH = 48;

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/** Identity shown on the button. Display only, never a credential. */
export interface SsoIdentity {
  /** What "Continue as ___" says. Already trimmed, de-controlled, and length-capped. */
  label: string;
}

export type SilentSsoSkip = "not-configured" | "already-attempted" | "already-signed-in";

export type SilentSsoDecision = { attempt: true } | { attempt: false; skip: SilentSsoSkip };

/**
 * Should this browser ask the IdP who it is?
 *
 * `endpoint` is resolved on the SERVER (`lib/env.ts`) and is `null` unless this
 * app is a configured ecosystem OIDC client, so a deployment without
 * `WITUS_OIDC_CLIENT_ID` never touches accounts.witus.online at all — an
 * affordance the visitor cannot complete is worse than no affordance.
 */
export function silentSsoDecision(input: {
  endpoint: string | null | undefined;
  search?: string | null;
  attempted?: boolean;
  signedIn?: boolean;
}): SilentSsoDecision {
  if (!input.endpoint) return { attempt: false, skip: "not-configured" };
  if (input.signedIn) return { attempt: false, skip: "already-signed-in" };
  if (input.attempted || hasAttemptMarker(input.search)) {
    return { attempt: false, skip: "already-attempted" };
  }
  return { attempt: true };
}

/** Does this query string carry the one-shot marker? Accepts "?a=b" or "a=b". */
export function hasAttemptMarker(search: string | null | undefined): boolean {
  if (typeof search !== "string" || search === "") return false;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get(SSO_ATTEMPT_PARAM) === SSO_ATTEMPT_VALUE;
}

/**
 * Add the one-shot marker to a same-origin path, preserving any query it
 * already carries. Idempotent, so a second pass cannot stack duplicates.
 */
export function withAttemptMarker(path: string): string {
  const [beforeHash, ...hashRest] = path.split("#");
  const hash = hashRest.length > 0 ? `#${hashRest.join("#")}` : "";
  const [pathname, ...queryRest] = beforeHash.split("?");
  const params = new URLSearchParams(queryRest.join("?"));
  params.set(SSO_ATTEMPT_PARAM, SSO_ATTEMPT_VALUE);
  return `${pathname}?${params.toString()}${hash}`;
}

/**
 * Split a discovery URL into the IdP's origin and its better-auth basePath.
 *
 *   https://accounts.witus.online/api/idp/.well-known/openid-configuration
 *     -> { origin: "https://accounts.witus.online", basePath: "/api/idp" }
 *
 * Everything below derives from this rather than naming accounts.witus.online a
 * second time, so the one external value this app asserts stays the discovery
 * URL it is already configured with (authoritative-values rule).
 */
function splitDiscoveryUrl(
  discoveryUrl: string | null | undefined,
): { origin: string; basePath: string } | null {
  if (!discoveryUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(discoveryUrl);
  } catch {
    return null;
  }
  const cut = parsed.pathname.indexOf("/.well-known/");
  if (cut < 0) return null;
  return { origin: parsed.origin, basePath: parsed.pathname.slice(0, cut) };
}

/**
 * The ecosystem session probe: `<idp-origin>/api/ecosystem/session`.
 *
 * NOT better-auth's `<basePath>/get-session`. That route returns the full
 * `{ session, user }` and `session` carries the SESSION TOKEN, so a credentialed
 * cross-origin read of it would let any ecosystem origin — or an XSS on one —
 * lift a live IdP session. `/api/ecosystem/session` is the purpose-built
 * replacement in `gemini/witus` (`app/api/ecosystem/session/route.ts`): same
 * cookie, but it answers with a display label and nothing else, and its
 * allow-origin list comes from the IdP's own client registry.
 *
 * It lives at a fixed path on the IdP's ORIGIN, not under the better-auth
 * basePath, which is why only `origin` is used here.
 */
export function silentSsoEndpointFromDiscovery(
  discoveryUrl: string | null | undefined,
): string | null {
  const parts = splitDiscoveryUrl(discoveryUrl);
  if (!parts) return null;
  return `${parts.origin}/api/ecosystem/session`;
}

/**
 * The IdP's RP-initiated logout endpoint, `<basePath>/oauth2/endsession` — the
 * `end_session_endpoint` the discovery document advertises. Unlike the probe it
 * DOES live under the better-auth basePath.
 *
 * BAM chose GLOBAL sign-out on 2026-08-30: signing out of one WitUS app signs
 * you out of all of them. Ending only this app's NextAuth session leaves the
 * IdP session alive, which — once "Continue as ..." is live — means signing out
 * and coming back offers to sign you straight back in. That reads as a broken
 * logout.
 */
export function endSessionEndpointFromDiscovery(
  discoveryUrl: string | null | undefined,
): string | null {
  const parts = splitDiscoveryUrl(discoveryUrl);
  if (!parts) return null;
  return `${parts.origin}${parts.basePath}/oauth2/endsession`;
}

/**
 * Read a display name out of the probe response.
 *
 * Shapes handled: `{ signedIn, user: { name } }` (what the IdP endpoint
 * returns), a bare user object, and every "nobody is signed in" answer —
 * including the 200-with-null-body a signed-out request gets. Anything else
 * yields null, which renders nothing.
 */
export function parseSilentSsoIdentity(payload: unknown): SsoIdentity | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if (root.signedIn === false) return null;
  const candidate =
    root.user && typeof root.user === "object" ? (root.user as Record<string, unknown>) : root;
  const label = cleanLabel(candidate.name) ?? cleanLabel(candidate.email);
  return label ? { label } : null;
}

function cleanLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(CONTROL_CHARS, "").trim();
  if (!cleaned) return null;
  return cleaned.length > MAX_LABEL_LENGTH
    ? `${cleaned.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`
    : cleaned;
}

/** Button copy. Kept here so the test pins the exact string the operator reads. */
export function continueAsLabel(identity: SsoIdentity | null): string {
  return identity ? `Continue as ${identity.label}` : "Sign in with WitUS";
}

/**
 * The full RP-initiated logout URL to navigate to AFTER the local session is
 * already destroyed.
 *
 * `clientId` is REQUIRED, not optional: better-auth rejects a
 * `post_logout_redirect_uri` with `invalid_request` unless the request carries
 * either a verifiable `id_token_hint` or an explicit `client_id`, and we have no
 * id_token client-side.
 *
 * `post_logout_redirect_uri` must be EXACTLY `<origin>/`, trailing slash
 * included: better-auth exact-matches it against the client's registered
 * redirectUrls, and the IdP registry (`gemini/witus/lib/identity/clients.ts`,
 * `postLogoutRedirectUriFor`) registers `origin + "/"` for every app. Drop the
 * slash and the IdP returns a 400.
 */
export function endSessionUrl(base: string, origin: string): string {
  const back = new URL("/", origin).toString();
  return `${base}&post_logout_redirect_uri=${encodeURIComponent(back)}`;
}
