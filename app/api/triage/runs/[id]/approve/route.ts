import { NextResponse } from "next/server";
import { z } from "zod";
import { getOperatorEmail } from "@/lib/session";
import { resumeRun, TriageRunError } from "@/lib/triage-runner";

// Resuming the graph runs execute + an LLM-free path; keep Node + headroom.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ApproveBodySchema = z.object({
  /** If present, the operator edited the proposal — decision becomes "edited". */
  editedPayload: z.record(z.string(), z.unknown()).optional(),
  operatorNote: z.string().optional(),
});

/**
 * POST /api/triage/runs/:id/approve — approve (optionally with edits) and
 * resume the paused graph. Operator session required.
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
  const parsed = ApproveBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  try {
    const run = await resumeRun(id, {
      decision: parsed.data.editedPayload ? "edited" : "approved",
      editedPayload: parsed.data.editedPayload,
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
