import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getOperatorEmail } from "@/lib/session";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

/**
 * Layout for the whole operator dashboard. The session check lives here so
 * every `/triage/*` route is protected in one place — no public access
 * (PRD §9). An unauthenticated visitor is sent to NextAuth's sign-in page.
 */
export default async function TriageLayout({
  children,
}: {
  children: ReactNode;
}) {
  const operator = await getOperatorEmail();
  if (!operator) {
    redirect("/signin");
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
