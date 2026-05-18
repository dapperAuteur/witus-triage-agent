import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { verifySignature } from "@/lib/hmac";
import { startRun, StartRunInputSchema } from "@/lib/triage-runner";

// The graph invocation runs three LLM-touching nodes synchronously.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/triage/start — kicks off a triage run for an incoming submission.
 *
 * Called machine-to-machine by WitUS Inbox. Authenticated with the shared
 * HMAC scheme (`x-triage-timestamp` + `x-triage-signature` over the raw body),
 * NOT a user session. The raw body must be read before parsing — the HMAC is
 * computed over exact bytes.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = getEnv().TRIAGE_INGEST_SECRET;
  if (!secret) {
    console.error("[triage/start] TRIAGE_INGEST_SECRET not configured");
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const timestamp = request.headers.get("x-triage-timestamp");
  const signatureHeader = request.headers.get("x-triage-signature");
  if (!timestamp || !signatureHeader) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const signature = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;

  const rawBody = await request.text();
  if (!verifySignature({ secret, timestamp, rawBody, signature })) {
    console.warn("[triage/start] hmac verification failed");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = StartRunInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const result = await startRun(parsed.data);
  return NextResponse.json({ ok: true, ...result }, { status: 200 });
}
