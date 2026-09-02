"use client";

/**
 * The sign-in / waitlist form.
 *
 * On submit, POST /api/signin/triage classifies the email at once:
 *  - `admin`  → trigger NextAuth's email magic-link, show "check your inbox";
 *  - `denied` → show an amber "this app is private" box with a violet
 *               "Join the waitlist" button.
 *
 * No Server Actions — this repo uses API routes (mirrors the rest of the app).
 */
import { useCallback, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  SILENT_SSO_TIMEOUT_MS,
  SSO_ATTEMPT_STORAGE_KEY,
  continueAsLabel,
  parseSilentSsoIdentity,
  silentSsoDecision,
  withAttemptMarker,
  type SsoIdentity,
} from "@/lib/silent-sso";

type State =
  | { kind: "idle" }
  | { kind: "linkSent" }
  | { kind: "denied"; email: string }
  | { kind: "waitlisted" }
  | { kind: "error"; message: string };

const INPUT_CLASS =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 " +
  "dark:border-slate-700 dark:bg-slate-950";

// "Sign in with WitUS" (ecosystem OIDC) is a client-rendered button, so its
// visibility is gated on the public build-time flag rather than the server-only
// WITUS_OIDC_CLIENT_ID that enables the provider itself. Set both together.
const WITUS_SSO_ENABLED = Boolean(process.env.NEXT_PUBLIC_WITUS_SSO);

export function SignInForm({
  silentCheckUrl = null,
}: {
  /**
   * IdP session endpoint for the silent "Continue as ..." check, resolved on
   * the SERVER (`witusSilentSsoEndpoint()`), or null when ecosystem SSO is not
   * configured. Never derived here: a URL built client-side is a default that
   * could outlive the gate.
   */
  silentCheckUrl?: string | null;
} = {}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [pending, setPending] = useState(false);
  const [identity, setIdentity] = useState<SsoIdentity | null>(null);

  // The silent ecosystem-session check. The form above is already on screen and
  // nothing here delays it; the WitUS button says "Sign in with WitUS" from the
  // first paint and only ever gains a better label. If the probe fails, times
  // out, is blocked by the browser's third-party-cookie rules, or the IdP does
  // not answer, NOTHING changes and NOTHING is said — a failed silent check has
  // to be completely invisible, and on Safari/Firefox it is the common case.
  useEffect(() => {
    if (!WITUS_SSO_ENABLED) return;
    const endpoint = silentCheckUrl;
    const decision = silentSsoDecision({
      endpoint,
      search: window.location.search,
      attempted: readAttempted(),
    });
    // `!endpoint` is already implied by decision.attempt; repeated so the
    // narrowing is the compiler's and not a cast that outlives the invariant.
    if (!decision.attempt || !endpoint) return;

    // Abort rather than hang. A probe still in flight when the operator has
    // moved on is a leak of attention, not just of a socket.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SILENT_SSO_TIMEOUT_MS);
    let live = true;

    // `credentials: "include"` is the whole mechanism: the answer depends on
    // the IdP's OWN cookie, which is third-party from here.
    fetch(endpoint, {
      credentials: "include",
      mode: "cors",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!live) return;
        // NEVER a credential. This name is display copy for a button whose
        // click runs the real OIDC code flow, and the ADMIN_EMAIL gate in
        // lib/auth.ts still decides who actually gets in.
        const found = parseSilentSsoIdentity(payload);
        if (found) setIdentity(found);
      })
      .catch(() => {
        // Invisible on purpose: network error, CORS refusal, abort, non-JSON.
      })
      .finally(() => clearTimeout(timer));

    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [silentCheckUrl]);

  const onWitusSignIn = useCallback(() => {
    setPending(true);
    // THE LOOP GUARD, written BEFORE the redirect and never after the return. A
    // marker written on return does not exist when the return is the thing that
    // failed — which is exactly the loop: probe says "Continue as X" -> click ->
    // the IdP cannot finish -> back to /signin -> probe -> forever. With it, one
    // attempt per tab; the next render offers the plain button and the email
    // form, which always work.
    markAttempted();
    void signIn("witus", { callbackUrl: "/triage" });
  }, []);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setPending(true);
    setState({ kind: "idle" });
    try {
      const res = await fetch("/api/signin/triage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { outcome?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);

      if (data.outcome === "admin") {
        const result = await signIn("email", {
          email,
          callbackUrl: "/triage",
          redirect: false,
        });
        if (result?.error) {
          throw new Error("Could not send the sign-in link. Try again.");
        }
        setState({ kind: "linkSent" });
      } else {
        setState({ kind: "denied", email });
      }
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setPending(false);
    }
  }

  async function onJoinWaitlist(deniedEmail: string): Promise<void> {
    setPending(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: deniedEmail }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not add you to the waitlist.");
      }
      setState({ kind: "waitlisted" });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setPending(false);
    }
  }

  if (state.kind === "waitlisted") {
    return (
      <p
        role="status"
        className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
      >
        You&apos;re on the list. We&apos;ll be in touch when the Triage Agent
        opens up.
      </p>
    );
  }

  if (state.kind === "linkSent") {
    return (
      <p
        role="status"
        className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
      >
        Check your inbox: a one-time sign-in link is on its way.
      </p>
    );
  }

  if (state.kind === "denied") {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <p>
            This app is private right now, and{" "}
            <span className="font-mono text-xs">{state.email}</span> isn&apos;t
            an authorized address, so you can&apos;t use it yet.
          </p>
          <p className="mt-2">
            Want to be notified when the Triage Agent becomes available?
          </p>
        </div>
        <Button
          variant="primary"
          disabled={pending}
          onClick={() => onJoinWaitlist(state.email)}
        >
          {pending ? "Adding…" : "Join the waitlist"}
        </Button>
        <p className="text-xs text-slate-500">
          <button
            type="button"
            onClick={() => {
              setEmail("");
              setState({ kind: "idle" });
            }}
            className="text-violet-700 hover:underline dark:text-violet-400"
          >
            Try a different email
          </button>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {state.kind === "error" && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          {state.message}
        </p>
      )}
      <label htmlFor="email" className="block text-sm font-medium">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={INPUT_CLASS}
      />
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Working…" : "Continue"}
      </Button>
      {WITUS_SSO_ENABLED && (
        <>
          <div className="flex items-center gap-3 py-1 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            or
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            className="w-full"
            onClick={onWitusSignIn}
          >
            {continueAsLabel(identity)}
          </Button>
          {/* Always in the DOM so the label change is announced when it
              happens, and silent (and invisible) when the probe found nothing. */}
          <p
            role="status"
            aria-live="polite"
            className={identity ? "text-center text-xs text-slate-500" : "sr-only"}
          >
            {identity ? "Not you? Use the email form above." : ""}
          </p>
        </>
      )}
    </form>
  );
}

/**
 * sessionStorage throws outright in some privacy modes, so both halves are
 * wrapped. A browser that cannot remember the attempt still gets the other half
 * of the guard: the `?sso=tried` marker written onto the URL below, which
 * survives a back-navigation to this page even with no usable storage.
 */
function readAttempted(): boolean {
  try {
    return window.sessionStorage.getItem(SSO_ATTEMPT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markAttempted(): void {
  try {
    window.sessionStorage.setItem(SSO_ATTEMPT_STORAGE_KEY, "1");
  } catch {
    // No storage, no marker — the URL half below still applies.
  }
  try {
    // replaceState, not push: this must not add a history entry, it only has to
    // make the entry we are about to leave carry the marker, so coming back to
    // it (back button, or an IdP bounce) lands on /signin?sso=tried.
    const marked = withAttemptMarker(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
    window.history.replaceState(window.history.state, "", marked);
  } catch {
    // History API refused. The sessionStorage half above still applies.
  }
}
