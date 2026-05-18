import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { triageRuns, submissions } from "@/db/schema";
import { RunList, type RunListItem } from "@/components/run-list";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /triage/history — runs that have reached a terminal state (executed,
 * rejected, or failed), newest first.
 */
export default async function TriageHistoryPage() {
  const db = getDb();
  const rows = await db
    .select({
      id: triageRuns.id,
      status: triageRuns.status,
      classification: triageRuns.classification,
      createdAt: triageRuns.createdAt,
      source: submissions.source,
      submitterName: submissions.submitterName,
    })
    .from(triageRuns)
    .innerJoin(submissions, eq(triageRuns.submissionId, submissions.id))
    .where(inArray(triageRuns.status, ["executed", "rejected", "failed"]))
    .orderBy(desc(triageRuns.createdAt));

  const runs: RunListItem[] = rows;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Triage history</h1>
      <p className="mt-1 text-sm text-slate-500">
        {runs.length} completed run{runs.length === 1 ? "" : "s"}.
      </p>
      <div className="mt-6">
        <RunList runs={runs} emptyMessage="No completed runs yet." />
      </div>
    </div>
  );
}
