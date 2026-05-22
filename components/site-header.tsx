import Image from "next/image";
import Link from "next/link";

const navLink =
  "rounded px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 " +
  "dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100";

export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 dark:border-slate-800">
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
        <nav aria-label="Primary" className="flex items-center gap-1 text-sm">
          <Link href="/triage" className={navLink}>
            Queue
          </Link>
          <Link href="/triage/history" className={navLink}>
            History
          </Link>
          <Link href="/admin" className={navLink}>
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
