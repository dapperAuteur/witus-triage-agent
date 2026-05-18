import { NextResponse } from "next/server";
import { z } from "zod";
import { getOperatorEmail } from "@/lib/session";
import { resumeRun, TriageRunError } from "@/lib/triage-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RejectBodySchema = z.object({
  operatorNote: z.string().optional(),
});

/**
 * POST /api/triage/runs/:id/reject — reject the proposal and resume the graph
 * down the log_rejection branch. Operator session required.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!(await getOperatorEmail())) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { id } = await context.params;
  const raw: unknown = await request.json().catch(() => ({}));
  const parsed = RejectBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  try {
    const run = await resumeRun(id, {
      decision: "rejected",
      operatorNote: parsed.data.operatorNote,
    });
    return NextResponse.json({ ok: true, run });
  } catch (err) {
    if (err instanceof TriageRunError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.kind === "not_found" ? 404 : 409 },
      );
    }
    throw err;
  }
}
