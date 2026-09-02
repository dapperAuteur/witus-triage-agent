"use client";

import { useCallback, useState } from "react";
import { signOut } from "next-auth/react";
import { endSessionUrl } from "@/lib/silent-sso";

/**
 * Sign out of the operator dashboard — and, when this app is a configured
 * ecosystem OIDC client, out of every other WitUS app in this browser too
 * (BAM's decision, 2026-08-30: "signout signs out of every app").
 *
 * ORDER IS THE SAFETY PROPERTY. NextAuth's `signOut({ redirect: false })` runs
 * FIRST and is awaited, so the local session is definitely destroyed before we
 * hand off. If the IdP is unreachable, refuses the logout, or the redirect never
 * completes, the operator is still signed out HERE. Handing off first would turn
 * any IdP failure into "I clicked sign out and I'm still signed in", which is
 * the one outcome a sign-out button must never produce.
 *
 * `endSessionBase` is resolved on the SERVER (`witusEndSessionEndpoint()` in
 * lib/env.ts) and already carries `client_id`; a client component must not read
 * the raw env. `null` means the shared session does not exist for this
 * deployment, and sign-out stays purely local — which is also why the label
 * changes: "Sign out of WitUS" promises something global, so it only appears
 * when the global step will actually run.
 */
export function SignOutButton({
  endSessionBase = null,
  className,
}: {
  endSessionBase?: string | null;
  className?: string;
}) {
  const [pending, setPending] = useState(false);

  const onClick = useCallback(() => {
    setPending(true);
    void (async () => {
      try {
        // `redirect: false` so we keep control of what happens next. Awaited:
        // the whole safety property is that this has finished before the line
        // below leaves our origin.
        await signOut({ redirect: false });
      } catch {
        // Best effort. A failure here must never trap someone in a session they
        // asked to leave, so we still fall through to the navigation.
      }
      if (endSessionBase) {
        // Full navigation, not a router push: this leaves our origin for the
        // IdP, which then returns to `<origin>/`. That exact URL — trailing
        // slash included — is what gemini/witus registers for this client
        // (`postLogoutRedirectUriFor`, which defaults to `origin + "/"`), and
        // better-auth exact-matches it. Derived from window.location.origin so
        // a preview deployment does not assert the production host; an
        // unregistered origin means the IdP declines the return trip, and the
        // operator is signed out either way.
        window.location.assign(endSessionUrl(endSessionBase, window.location.origin));
        return;
      }
      // Local-only: go to a PUBLIC page rather than refreshing in place, so
      // signing out from a gated route cannot re-render it logged-out.
      window.location.assign("/");
    })();
  }, [endSessionBase]);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className={className}
    >
      {pending ? "Signing out…" : endSessionBase ? "Sign out of WitUS" : "Sign out"}
    </button>
  );
}
