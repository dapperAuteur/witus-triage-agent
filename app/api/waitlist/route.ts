import { NextResponse, after } from "next/server";
import { z } from "zod";
import { addToWaitlist } from "@/lib/waitlist";
import { submitToInbox } from "@/lib/submit-to-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ email: z.string().email() });

/**
 * POST /api/waitlist — record a non-admin's waitlist signup, then publish it
 * to the central WitUS Inbox so BAM triages and replies from one place.
 *
 * The Inbox webhook is fire-and-forget (`after()`) so the user's response is
 * never blocked on it. The payload carries only the email + a timestamp — no
 * IP, no user-agent (PII rule).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const raw: unknown = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid email" },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();

  try {
    await addToWaitlist(email);
  } catch (err) {
    const code = err instanceof Error ? err.name : "UnknownError";
    console.error("[waitlist] add failed err=%s", code);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  after(async () => {
    await submitToInbox({
      form_type: "waitlist-signup",
      submitter_email: email,
      priority: "normal",
      payload: { email, submitted_at: new Date().toISOString() },
    });
  });

  return NextResponse.json({ ok: true });
}
