import Image from "next/image";
import { redirect } from "next/navigation";
import { getOperatorEmail } from "@/lib/session";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /signin — the custom sign-in page (NextAuth `pages.signIn`). The only page
 * reachable without a session. A non-admin email is turned away here, into the
 * waitlist flow, rather than being sent a magic link they could never use.
 */
export default async function SignInPage() {
  if (await getOperatorEmail()) {
    redirect("/triage");
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <Image
        src="/brand/witus/wordmark.svg"
        alt="WitUS"
        width={220}
        height={56}
        priority
        className="h-10 w-auto"
      />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Sign in to the Triage Agent
      </h1>
      <p className="mt-2 mb-6 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        This dashboard is private — only the operator can sign in. Enter your
        email; we&apos;ll either send a one-time sign-in link, or invite you to
        the waitlist for when this opens up.
      </p>
      <SignInForm />
    </main>
  );
}
