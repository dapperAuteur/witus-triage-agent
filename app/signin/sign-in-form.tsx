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
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

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

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [pending, setPending] = useState(false);

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
        Check your inbox — a one-time sign-in link is on its way.
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
            an authorized address — you can&apos;t use it yet.
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
    </form>
  );
}
