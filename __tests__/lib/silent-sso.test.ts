import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SSO_ATTEMPT_STORAGE_KEY,
  continueAsLabel,
  endSessionEndpointFromDiscovery,
  endSessionUrl,
  hasAttemptMarker,
  parseSilentSsoIdentity,
  silentSsoDecision,
  silentSsoEndpointFromDiscovery,
  withAttemptMarker,
} from "@/lib/silent-sso";

/**
 * Ecosystem SSO: the silent "Continue as <name>" check and global sign-out.
 *
 * Pinned in order of what each would cost if it broke:
 *   1. SIGN-OUT ORDERING. NextAuth's local sign-out must complete BEFORE the
 *      handoff to the IdP. Reverse it and any IdP failure becomes "I clicked
 *      sign out and I'm still signed in".
 *   2. THE REDIRECT LOOP. probe -> "Continue as X" -> click -> IdP declines ->
 *      back to /signin -> probe. It never shows up in normal use, so it is
 *      simulated end to end below.
 *   3. INVISIBLE FAILURE. Nothing the probe returns may produce an error, a
 *      stuck spinner, or a claim about who the visitor is.
 *   4. THE NAME IS NOT A CREDENTIAL. It crosses an origin boundary, so it is
 *      sanitised before it reaches a button and gates nothing.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

/** Assertions about what the CODE does must not be satisfied by a comment. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const DISCOVERY =
  "https://accounts.witus.online/api/idp/.well-known/openid-configuration";
const ENDPOINT = "https://accounts.witus.online/api/ecosystem/session";

describe("the gate: the probe never fires without a configured client", () => {
  it("stays dark when ecosystem SSO is not configured", () => {
    for (const endpoint of [null, undefined, ""]) {
      expect(silentSsoDecision({ endpoint, search: "" })).toEqual({
        attempt: false,
        skip: "not-configured",
      });
    }
  });

  it("attempts on a configured endpoint and a clean first visit", () => {
    expect(silentSsoDecision({ endpoint: ENDPOINT, search: "" })).toEqual({
      attempt: true,
    });
  });

  it("does not ask on behalf of someone already signed in", () => {
    expect(silentSsoDecision({ endpoint: ENDPOINT, signedIn: true })).toEqual({
      attempt: false,
      skip: "already-signed-in",
    });
  });

  it("keeps the endpoint null unless WITUS_OIDC_CLIENT_ID is set", () => {
    // Both resolvers are server-side and both open with the same guard. If that
    // guard is dropped, an unconfigured deployment starts probing an IdP it can
    // never complete a sign-in against.
    const env = stripComments(read("lib/env.ts"));
    const silent = env.slice(env.indexOf("export function witusSilentSsoEndpoint"));
    expect(silent).toContain("if (!env.WITUS_OIDC_CLIENT_ID) return null;");
    const logout = env.slice(env.indexOf("export function witusEndSessionEndpoint"));
    expect(logout).toContain("if (!clientId) return null;");
  });

  it("only ever asks the server-resolved endpoint, never one it builds itself", () => {
    // Comments may name the IdP; CODE must not. A URL literal in a client
    // component is a default that could quietly outlive the gate.
    const code = stripComments(read("app/signin/sign-in-form.tsx"));
    expect(code).not.toContain("https://");
    expect(code).not.toContain("witus.online");
    expect(code).toContain("const endpoint = silentCheckUrl;");
    expect(code).toContain("fetch(endpoint,");
    // Exactly one probe, and the decision function is what guards it.
    const effect = code.slice(code.indexOf("useEffect(() => {"), code.indexOf("fetch(endpoint,"));
    expect(effect).toContain("silentSsoDecision({");
    expect(effect).toContain("if (!decision.attempt || !endpoint) return;");
    // And it respects the app's existing public-flag gate on the button.
    expect(effect).toContain("if (!WITUS_SSO_ENABLED) return;");
  });

  it("passes the endpoint down from the server page, and only from there", () => {
    const page = read("app/signin/page.tsx");
    expect(page).toContain("witusSilentSsoEndpoint");
    expect(page).toContain("<SignInForm silentCheckUrl={witusSilentSsoEndpoint()} />");
    expect(page.split("<SignInForm").length - 1).toBe(1);
  });
});

describe("global sign-out", () => {
  it("destroys the local session BEFORE handing off to the IdP", () => {
    // THE POINT OF THIS TEST. Reverse these two and an unreachable IdP leaves
    // the operator signed in on a machine they walked away from.
    const code = stripComments(read("components/sign-out-button.tsx"));
    const local = code.indexOf("await signOut({ redirect: false })");
    const handoff = code.indexOf("window.location.assign(endSessionUrl(");
    expect(local).toBeGreaterThan(-1);
    expect(handoff).toBeGreaterThan(-1);
    expect(local).toBeLessThan(handoff);
    // Awaited, not fire-and-forget: an un-awaited signOut races the navigation.
    expect(code).toContain("await signOut({ redirect: false });");
    // A full navigation, not a router push — it leaves this origin.
    expect(code).not.toContain("router.push");
  });

  it("appends post_logout_redirect_uri with its trailing slash", () => {
    // better-auth EXACT-matches this against the client's registered
    // redirectUrls, and gemini/witus registers `origin + "/"` for every app
    // (postLogoutRedirectUriFor). Drop the slash and the IdP returns a 400.
    const base =
      "https://accounts.witus.online/api/idp/oauth2/endsession?client_id=triage";
    expect(endSessionUrl(base, "https://triage.agent.witus.online")).toBe(
      `${base}&post_logout_redirect_uri=${encodeURIComponent("https://triage.agent.witus.online/")}`,
    );
    // A trailing slash on the origin must not produce a doubled one.
    expect(endSessionUrl(base, "https://triage.agent.witus.online/")).toContain(
      encodeURIComponent("https://triage.agent.witus.online/"),
    );
    // `&`, not `?`: the base already carries client_id.
    expect(endSessionUrl(base, "https://triage.agent.witus.online")).not.toContain(
      "?post_logout_redirect_uri",
    );
  });

  it("carries client_id, which better-auth requires", () => {
    // Without a verifiable id_token_hint — which we do not have client-side —
    // better-auth rejects post_logout_redirect_uri with invalid_request unless
    // client_id is present.
    const env = stripComments(read("lib/env.ts"));
    const logout = env.slice(env.indexOf("export function witusEndSessionEndpoint"));
    expect(logout).toContain("?client_id=${encodeURIComponent(clientId)}");
  });

  it("says what it will actually do", () => {
    // "Sign out of WitUS" promises something global, so it only appears when
    // the global step will really run.
    const code = read("components/sign-out-button.tsx");
    expect(code).toContain('endSessionBase ? "Sign out of WitUS" : "Sign out"');
  });

  it("derives the RP-initiated logout endpoint under the IdP's basePath", () => {
    expect(endSessionEndpointFromDiscovery(DISCOVERY)).toBe(
      "https://accounts.witus.online/api/idp/oauth2/endsession",
    );
    expect(endSessionEndpointFromDiscovery(null)).toBeNull();
    expect(endSessionEndpointFromDiscovery("not a url")).toBeNull();
  });
});

describe("the redirect loop: an IdP that will not sign the operator in", () => {
  it("attempts once, then never again in that tab", () => {
    // 1. First arrival: no marker anywhere.
    let storage = false;
    expect(silentSsoDecision({ endpoint: ENDPOINT, search: "", attempted: storage })).toEqual({
      attempt: true,
    });

    // 2. The probe answered, the operator clicked, and the marker is written
    //    BEFORE the redirect — into sessionStorage AND onto the URL.
    storage = true;
    const marked = withAttemptMarker("/signin");
    expect(marked).toBe("/signin?sso=tried");

    // 3. The IdP declines and the operator comes back to this page. Either half
    //    of the marker alone is enough to stop the second attempt.
    for (const [search, attempted] of [
      ["?sso=tried", true],
      ["", true],
      ["?sso=tried", false],
    ] as const) {
      expect(silentSsoDecision({ endpoint: ENDPOINT, search, attempted })).toEqual({
        attempt: false,
        skip: "already-attempted",
      });
    }
  });

  it("writes the marker BEFORE redirecting, never after the return", () => {
    const code = stripComments(read("app/signin/sign-in-form.tsx"));
    const write = code.indexOf("markAttempted();");
    const redirect = code.indexOf('signIn("witus"');
    expect(write).toBeGreaterThan(-1);
    expect(redirect).toBeGreaterThan(-1);
    expect(write).toBeLessThan(redirect);
    // The URL half must not add a history entry, or "back" becomes unusable.
    expect(code).toContain("window.history.replaceState(");
    expect(code).not.toContain("window.history.pushState(");
    // Every storage touch is wrapped: sessionStorage THROWS in some privacy
    // modes, and a sign-in page that throws on render is worse than no guard.
    expect(code).toContain("function readAttempted()");
    expect(code).toContain("function markAttempted()");
    expect(code.match(/try \{/g)?.length).toBeGreaterThanOrEqual(2);
    // The key lives in the shared module so component and tests cannot drift.
    expect(SSO_ATTEMPT_STORAGE_KEY).toBe("witus.sso.attempted");
  });
});

describe("the one-shot marker", () => {
  it("reads only its own exact value", () => {
    expect(hasAttemptMarker("?sso=tried")).toBe(true);
    expect(hasAttemptMarker("sso=tried")).toBe(true);
    expect(hasAttemptMarker("?error=x&sso=tried")).toBe(true);
    expect(hasAttemptMarker("?sso=something-else")).toBe(false);
    expect(hasAttemptMarker("?next=/sso=tried")).toBe(false);
    expect(hasAttemptMarker("")).toBe(false);
    expect(hasAttemptMarker(null)).toBe(false);
    expect(hasAttemptMarker(undefined)).toBe(false);
  });

  it("keeps any query the page already carries", () => {
    expect(withAttemptMarker("/signin?error=OAuthCallback")).toBe(
      "/signin?error=OAuthCallback&sso=tried",
    );
    expect(withAttemptMarker("/signin#top")).toBe("/signin?sso=tried#top");
  });

  it("is idempotent, so a second pass cannot stack duplicates", () => {
    const once = withAttemptMarker("/signin?error=OAuthCallback");
    expect(withAttemptMarker(once)).toBe(once);
  });
});

describe("the endpoint is derived, never invented", () => {
  it("turns the configured discovery URL into the IdP's session route", () => {
    expect(silentSsoEndpointFromDiscovery(DISCOVERY)).toBe(ENDPOINT);
    // The probe lives at a FIXED path on the IdP's ORIGIN, not under its
    // better-auth basePath, so an IdP mounted at the root derives the same route.
    expect(
      silentSsoEndpointFromDiscovery("https://id.example.test/.well-known/openid-configuration"),
    ).toBe("https://id.example.test/api/ecosystem/session");
  });

  it("never probes better-auth's /get-session, which would expose a session token", () => {
    // /get-session returns { session, user } and `session` carries the SESSION
    // TOKEN, so a credentialed cross-origin read of it would let any ecosystem
    // origin — or an XSS on one — lift a live IdP session. If someone "fixes"
    // the probe by re-deriving that path, this fails.
    for (const discovery of [
      DISCOVERY,
      "https://id.example.test/.well-known/openid-configuration",
    ]) {
      expect(silentSsoEndpointFromDiscovery(discovery)).not.toContain("get-session");
    }
  });

  it("returns null rather than guessing when there is nothing to derive from", () => {
    expect(silentSsoEndpointFromDiscovery(null)).toBeNull();
    expect(silentSsoEndpointFromDiscovery(undefined)).toBeNull();
    expect(silentSsoEndpointFromDiscovery("")).toBeNull();
    expect(silentSsoEndpointFromDiscovery("not a url")).toBeNull();
    expect(silentSsoEndpointFromDiscovery("https://accounts.witus.online/api/idp")).toBeNull();
  });

  it("names the discovery fallback exactly once, and labels it a fallback", () => {
    // Two files used to name this URL. If they ever disagreed, the silent check
    // would probe a different host than the one the click signs in against.
    const env = read("lib/env.ts");
    const auth = read("lib/auth.ts");
    expect(env).toContain(`export const WITUS_OIDC_DISCOVERY_FALLBACK =\n  "${DISCOVERY}"`);
    expect(auth).toContain("WITUS_OIDC_DISCOVERY_FALLBACK");
    expect(stripComments(auth)).not.toContain(DISCOVERY);
    // And the env var is what actually wins.
    expect(stripComments(auth)).toContain(
      "process.env.WITUS_OIDC_DISCOVERY_URL ?? WITUS_OIDC_DISCOVERY_FALLBACK",
    );
  });
});

describe("reading the probe answer", () => {
  it("finds the name in the IdP's ecosystem-session shape", () => {
    expect(
      parseSilentSsoIdentity({ signedIn: true, user: { name: "Brand Anthony McDonald" } }),
    ).toEqual({ label: "Brand Anthony McDonald" });
  });

  it("accepts a bare user object and falls back to the email", () => {
    expect(parseSilentSsoIdentity({ name: "Ada", email: "ada@example.test" })).toEqual({
      label: "Ada",
    });
    expect(parseSilentSsoIdentity({ user: { name: "", email: "ada@example.test" } })).toEqual({
      label: "ada@example.test",
    });
  });

  it("returns nothing for every shape that means nobody is signed in", () => {
    expect(parseSilentSsoIdentity({ signedIn: false })).toBeNull();
    // Even if a signed-out answer carries a stale name, `signedIn: false` wins.
    expect(parseSilentSsoIdentity({ signedIn: false, user: { name: "Ada" } })).toBeNull();
    expect(parseSilentSsoIdentity(null)).toBeNull();
    expect(parseSilentSsoIdentity(undefined)).toBeNull();
    expect(parseSilentSsoIdentity({})).toBeNull();
    expect(parseSilentSsoIdentity({ user: null })).toBeNull();
    expect(parseSilentSsoIdentity({ user: { id: "u1" } })).toBeNull();
    expect(parseSilentSsoIdentity("Ada")).toBeNull();
    expect(parseSilentSsoIdentity(42)).toBeNull();
    expect(parseSilentSsoIdentity([{ name: "Ada" }])).toBeNull();
  });

  it("cleans a name it did not author before putting it on a button", () => {
    // The answer comes from another origin, so it is untrusted input even
    // though it is only ever display copy.
    expect(parseSilentSsoIdentity({ name: "  Ada Lovelace  " })).toEqual({
      label: "Ada Lovelace",
    });
    expect(parseSilentSsoIdentity({ name: "Ada\u0007\u001bLovelace" })).toEqual({
      label: "AdaLovelace",
    });
    expect(parseSilentSsoIdentity({ name: "   " })).toBeNull();
    const long = parseSilentSsoIdentity({ name: "N".repeat(300) });
    expect(long?.label.length).toBeLessThanOrEqual(48);
  });

  it("says the right thing in both states", () => {
    expect(continueAsLabel(null)).toBe("Sign in with WitUS");
    expect(continueAsLabel({ label: "Ada" })).toBe("Continue as Ada");
  });
});

describe("a failed check is invisible", () => {
  it("swallows every probe outcome and never renders an error", () => {
    const code = stripComments(read("app/signin/sign-in-form.tsx"));
    expect(code).toContain(".catch(() => {");
    // No error state and no spinner tied to the probe: the button is fully
    // usable from first paint and only ever gains a better label.
    expect(code).not.toMatch(/useState[^\n]*ssoError/i);
    expect(code).not.toMatch(/useState[^\n]*ssoLoading/i);
    // And it cannot hang the page open forever.
    expect(code).toContain("SILENT_SSO_TIMEOUT_MS");
    expect(code).toContain("controller.abort()");
  });
});
