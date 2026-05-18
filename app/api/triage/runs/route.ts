import { NextResponse, type NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { triageRuns, triageRunStatus } from "@/db/schema";
import { getOperatorEmail } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/triage/runs — list triage runs, newest first.
 * Optional `?status=` filter. Operator session required.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await getOperatorEmail())) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const db = getDb();
  const statusParam = request.nextUrl.searchParams.get("status");

  if (statusParam) {
    if (!triageRunStatus.enumValues.includes(statusParam as never)) {
      return NextResponse.json(
        { ok: false, error: "invalid status filter" },
        { status: 400 },
      );
    }
    const runs = await db
      .select()
      .from(triageRuns)
      .where(eq(triageRuns.status, statusParam as (typeof triageRunStatus.enumValues)[number]))
      .orderBy(desc(triageRuns.createdAt));
    return NextResponse.json({ ok: true, runs });
  }

  const runs = await db
    .select()
    .from(triageRuns)
    .orderBy(desc(triageRuns.createdAt));
  return NextResponse.json({ ok: true, runs });
}
