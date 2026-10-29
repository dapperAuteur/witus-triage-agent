"use client";

import { useCallback, useId, useState } from "react";
import { signOut } from "next-auth/react";
import {
  SIGN_OUT_EVERYWHERE_HELP,
  SIGN_OUT_EVERYWHERE_LABEL,
  SIGN_OUT_LABEL,
  SIGNING_OUT_LABEL,
  signOutEverywhere,
  signOutHere,
  type SignOutEffects,
} from "@/lib/silent-sso";

/**
 * Sign-out controls (BAM, 2026-10-29, witus task 128 option (b)).
 *
 * - `SignOutButton` ("Sign out") ends ONLY this app's session and goes to `/`.
 *   It never navigates to the IdP and its label never changes (shared UI rule:
 *   the header Sign out control is never renamed or removed).
 * - `SignOutEverywhereButton` ("Sign out of WitUS everywhere") is a secondary
 *   control that also ends the shared accounts.witus.online session. It
 *   renders only when `endSessionBase` is non-null.
 *
 * `endSessionBase` is resolved on the SERVER (`witusEndSessionEndpoint()` in
 * lib/env.ts) and already carries `client_id`; a client component must not
 * read the raw env. `null` means this app is not a configured ecosystem OIDC
 * client, so there is no shared session to end.
 */

// `redirect: false` so we keep control of what happens next. The navigation
// is a full one, not a router push: the everywhere flow leaves our origin for
// the IdP, which returns to `<origin>/` (what gemini/witus registers for this
// client via `postLogoutRedirectUriFor`; better-auth exact-matches it).
const browserEffects: SignOutEffects = {
  endLocalSession: () => signOut({ redirect: false }),
  navigate: (url) => window.location.assign(url),
};

export function SignOutButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);

  const onClick = useCallback(() => {
    setPending(true);
    void signOutHere(browserEffects);
  }, []);

  return (
    <button type="button" disabled={pending} onClick={onClick} className={className}>
      {pending ? SIGNING_OUT_LABEL : SIGN_OUT_LABEL}
    </button>
  );
}

export function SignOutEverywhereButton({
  endSessionBase = null,
  className,
  helpClassName,
}: {
  endSessionBase?: string | null;
  className?: string;
  helpClassName?: string;
}) {
  const [pending, setPending] = useState(false);
  const helpId = useId();

  const onClick = useCallback(() => {
    if (!endSessionBase) return;
    setPending(true);
    // ORDER IS THE SAFETY PROPERTY: signOutEverywhere destroys the local
    // session FIRST, then hands off to the IdP (see lib/silent-sso.ts).
    void signOutEverywhere(endSessionBase, window.location.origin, browserEffects);
  }, [endSessionBase]);

  if (!endSessionBase) return null;

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={onClick}
        aria-describedby={helpId}
        className={className}
      >
        {pending ? SIGNING_OUT_LABEL : SIGN_OUT_EVERYWHERE_LABEL}
      </button>
      <p id={helpId} className={helpClassName}>
        {SIGN_OUT_EVERYWHERE_HELP}
      </p>
    </>
  );
}
