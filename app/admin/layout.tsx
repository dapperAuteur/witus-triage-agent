import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getOperatorEmail } from "@/lib/session";

/**
 * Layout for the admin area. Same operator-session gate as `/triage`
 * (`app/triage/layout.tsx`) — only `ADMIN_EMAIL` reaches it; everyone else is
 * sent to sign in. No public access. Header + footer come from the root layout
 * (`app/layout.tsx`).
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const operator = await getOperatorEmail();
  if (!operator) {
    redirect("/signin");
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
      {children}
    </main>
  );
}
