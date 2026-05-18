import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { triageRuns, submissions } from "@/db/schema";
import { RunList, type RunListItem } from "@/components/run-list";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /triage — the pending-approval queue. The operator sweeps this daily;
 * runs awaiting a decision, newest first.
 */
export default async function TriageQueuePage() {
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
    .where(eq(triageRuns.status, "pending_approval"))
    .orderBy(desc(triageRuns.createdAt));

  const runs: RunListItem[] = rows;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Triage queue</h1>
      <p className="mt-1 text-sm text-slate-500">
        {runs.length === 0
          ? "Nothing waiting for approval."
          : `${runs.length} run${runs.length === 1 ? "" : "s"} awaiting your approval.`}
      </p>
      <div className="mt-6">
        <RunList
          runs={runs}
          emptyMessage="The queue is clear — no runs are waiting for approval."
        />
      </div>
    </div>
  );
}
