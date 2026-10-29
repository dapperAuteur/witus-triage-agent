import Image from "next/image";
import Link from "next/link";
import { witusEndSessionEndpoint } from "@/lib/env";
import { getOperatorEmail } from "@/lib/session";
import { HeaderNav } from "./header-nav";

/**
 * Site header — rendered once from the root layout, so it appears on every page.
 * Auth-aware: a signed-out visitor gets a minimal nav (Help, Sign in); the
 * operator gets the full dashboard nav. Reading the session here opts routes
 * into dynamic rendering, which is fine for an operator tool.
 */
export async function SiteHeader() {
  const authenticated = Boolean(await getOperatorEmail());
  // "Sign out of WitUS everywhere" (BAM, 2026-10-29, witus task 128 option
  // (b)): resolved on the SERVER (it carries client_id) and null unless this
  // app is a configured ecosystem OIDC client, in which case that control does
  // not render. Plain "Sign out" never uses it. Only computed for a signed-in
  // operator — a signed-out visitor has no sign-out controls.
  const endSessionBase = authenticated ? witusEndSessionEndpoint() : null;

  return (
    <header className="relative border-b border-slate-200 dark:border-slate-800">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
        >
          <Image
            src="/brand/witus/logomark.svg"
            alt=""
            aria-hidden="true"
            width={28}
            height={28}
            className="h-7 w-auto"
          />
          <span className="font-semibold">
            WitUS <span className="text-violet-600 dark:text-violet-400">Triage</span>
          </span>
        </Link>
        <HeaderNav authenticated={authenticated} endSessionBase={endSessionBase} />
      </div>
    </header>
  );
}
