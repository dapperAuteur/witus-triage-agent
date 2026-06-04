"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Primary nav links. The set is auth-aware: a signed-out visitor sees only the
 * pages they can reach (Help, Sign in); the operator sees the full dashboard.
 * Auth is resolved server-side in `SiteHeader` and passed down, so this stays a
 * pure-UI client component — no `SessionProvider`, no client-side session read.
 */
const OPERATOR_LINKS: { href: string; label: string }[] = [
  { href: "/triage", label: "Queue" },
  { href: "/triage/history", label: "History" },
  { href: "/triage/waitlist", label: "Waitlist" },
  { href: "/admin", label: "Admin" },
  { href: "/help", label: "Help" },
];

const PUBLIC_LINKS: { href: string; label: string }[] = [
  { href: "/help", label: "Help" },
  { href: "/signin", label: "Sign in" },
];

const navLink =
  "inline-flex min-h-11 items-center rounded px-3 text-slate-600 hover:bg-slate-100 " +
  "hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-violet-500 dark:text-slate-400 dark:hover:bg-slate-800 " +
  "dark:hover:text-slate-100";

export function HeaderNav({ authenticated }: { authenticated: boolean }) {
  const [open, setOpen] = useState(false);
  const links = authenticated ? OPERATOR_LINKS : PUBLIC_LINKS;

  return (
    <nav aria-label="Primary" className="flex items-center text-sm">
      {/* sm+ : inline links */}
      <ul className="hidden items-center gap-1 sm:flex">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className={navLink}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>

      {/* < sm : hamburger disclosure */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 sm:hidden dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        <svg
          aria-hidden="true"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {open ? (
            <path d="M18 6 6 18M6 6l12 12" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>

      {open && (
        <ul
          id="mobile-nav"
          className="absolute inset-x-0 top-full z-20 border-b border-slate-200 bg-white px-4 py-2 shadow-lg sm:hidden dark:border-slate-800 dark:bg-slate-950"
        >
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={() => setOpen(false)}
                className={`block ${navLink}`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
