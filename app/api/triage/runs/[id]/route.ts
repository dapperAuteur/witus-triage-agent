import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { triageRuns, triageAuditLog } from "@/db/schema";
import { getOperatorEmail } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/triage/runs/:id — a single run with its full state + audit trail.
 * Operator session required.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!(await getOperatorEmail())) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(triageRuns)
    .where(eq(triageRuns.id, id))
    .limit(1);
  const run = rows[0];
  if (!run) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const audit = await db
    .select()
    .from(triageAuditLog)
    .where(eq(triageAuditLog.runId, id))
    .orderBy(asc(triageAuditLog.createdAt));

  return NextResponse.json({ ok: true, run, audit });
}
