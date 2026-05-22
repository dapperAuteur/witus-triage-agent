import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ email: z.string().email() });

/**
 * POST /api/signin/triage — at sign-in submit time, decide whether an email is
 * the operator (`admin`) or not (`denied`). The custom sign-in form uses this
 * to show a non-admin the waitlist offer *immediately*, before any magic-link
 * email is sent.
 *
 * This is an email-enumeration oracle by design: the admin address is public,
 * and the sign-in UX needs an instant admin/denied answer. The NextAuth
 * `signIn` callback (lib/auth.ts) is the real server-side gate regardless.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const raw: unknown = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }

  const adminEmail = (getEnv().ADMIN_EMAIL ?? "").toLowerCase();
  const email = parsed.data.email.trim().toLowerCase();
  const outcome = adminEmail && email === adminEmail ? "admin" : "denied";

  return NextResponse.json({ outcome });
}
