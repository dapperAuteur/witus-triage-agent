import Image from "next/image";
import Link from "next/link";
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
        <HeaderNav authenticated={authenticated} />
      </div>
    </header>
  );
}
