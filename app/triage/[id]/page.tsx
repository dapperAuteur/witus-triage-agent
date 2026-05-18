import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { triageRuns, submissions, triageAuditLog } from "@/db/schema";
import { Card, CardLabel } from "@/components/ui/card";
import {
  RunStatusBadge,
  CategoryBadge,
  ProductHealthBadge,
} from "@/components/run-badges";
import { ApprovalControls } from "@/components/approval-controls";
import { getLangsmithRunUrl } from "@/lib/langsmith";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readString(payload: unknown, key: string): string {
  if (payload && typeof payload === "object" && key in payload) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return "";
}

/**
 * /triage/:id — a single run: the agent's state breakdown, the proposed
 * action, the approval controls (while pending), and the audit trail.
 */
export default async function TriageRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const db = getDb();
  const rows = await db
    .select({
      run: triageRuns,
      source: submissions.source,
      submitterName: submissions.submitterName,
      submitterEmail: submissions.submitterEmail,
      payload: submissions.payload,
    })
    .from(triageRuns)
    .innerJoin(submissions, eq(triageRuns.submissionId, submissions.id))
    .where(eq(triageRuns.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) notFound();

  const { run } = row;
  const audit = await db
    .select()
    .from(triageAuditLog)
    .where(eq(triageAuditLog.runId, id))
    .orderBy(asc(triageAuditLog.createdAt));

  const langsmithUrl = getLangsmithRunUrl(run.langsmithRunId);
  const submissionBody =
    [readString(row.payload, "subject"), readString(row.payload, "message")]
      .filter((s) => s.length > 0)
      .join("\n\n") || JSON.stringify(row.payload, null, 2);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/triage"
          className="text-sm text-violet-700 hover:underline dark:text-violet-400"
        >
          ← Back to queue
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Triage run</h1>
          <RunStatusBadge status={run.status} />
        </div>
        <p className="mt-1 font-mono text-xs text-slate-500">{run.id}</p>
        {langsmithUrl && (
          <a
            href={langsmithUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-sm text-violet-700 hover:underline dark:text-violet-400"
          >
            Open in LangSmith
            <span className="sr-only"> (opens in new tab)</span>
            {run.langsmithRunId && (
              <span className="ml-1 font-mono text-xs text-slate-500">
                run {run.langsmithRunId}
              </span>
            )}
          </a>
        )}
      </div>

      {/* Submission */}
      <Card as="section" ariaLabel="Submission">
        <CardLabel>Submission</CardLabel>
        <p className="mt-2 text-sm text-slate-500">
          {row.source} · {row.submitterName ?? "Unknown sender"}
          {row.submitterEmail ? ` · ${row.submitterEmail}` : ""}
        </p>
        <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm text-slate-700 dark:text-slate-300">
          {submissionBody}
        </pre>
      </Card>

      {/* Classification */}
      <Card as="section" ariaLabel="Classification">
        <CardLabel>Classification</CardLabel>
        {run.classification ? (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <CategoryBadge category={run.classification.category} />
              <span className="text-xs text-slate-500">
                confidence {run.classification.confidence}
              </span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {run.classification.rationale}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Not classified.</p>
        )}
      </Card>

      {/* Enrichment */}
      <Card as="section" ariaLabel="Enrichment">
        <CardLabel>Enrichment</CardLabel>
        {run.enrichment ? (
          <div className="mt-2 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500">Product status:</span>
              <ProductHealthBadge status={run.enrichment.productStatus} />
              <span className="text-slate-500">
                · Customer: {run.enrichment.customerTenure}
              </span>
            </div>
            <div>
              <p className="text-slate-500">
                Past submissions: {run.enrichment.pastSubmissions.length}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-700 dark:text-slate-300">
                {run.enrichment.pastSubmissions.map((p) => (
                  <li key={p.id}>{p.summary}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Not enriched.</p>
        )}
      </Card>

      {/* Proposed action */}
      <Card as="section" ariaLabel="Proposed action">
        <CardLabel>Proposed action</CardLabel>
        {run.proposedAction ? (
          <div className="mt-2 space-y-3">
            <p className="text-sm">
              <span className="font-mono font-medium text-violet-700 dark:text-violet-400">
                {run.proposedAction.type}
              </span>
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {run.proposedAction.reasoning}
            </p>
            {typeof run.proposedAction.payload.draft === "string" && (
              <div>
                <CardLabel>Drafted reply</CardLabel>
                <pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-slate-50 p-3 font-sans text-sm text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                  {run.proposedAction.payload.draft}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No action proposed.</p>
        )}
      </Card>

      {/* Approval gate */}
      {run.status === "pending_approval" && run.proposedAction && (
        <Card as="section" ariaLabel="Approval">
          <CardLabel>Your decision</CardLabel>
          <div className="mt-3">
            <ApprovalControls
              runId={run.id}
              proposedAction={run.proposedAction}
            />
          </div>
        </Card>
      )}

      {/* Outcome (once decided) */}
      {run.approval && (
        <Card as="section" ariaLabel="Outcome">
          <CardLabel>Outcome</CardLabel>
          <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300">
            <p>Decision: {run.approval.decision}</p>
            {run.approval.operatorNote && (
              <p>Operator note: {run.approval.operatorNote}</p>
            )}
            {run.execution && (
              <p>
                Execution: {run.execution.result}
                {run.execution.errorMessage
                  ? ` — ${run.execution.errorMessage}`
                  : ""}
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Audit trail */}
      <Card as="section" ariaLabel="Audit trail">
        <CardLabel>Audit trail</CardLabel>
        <ol className="mt-2 space-y-1 text-sm">
          {audit.map((entry) => (
            <li key={entry.id} className="flex gap-3">
              <span className="font-mono text-xs text-slate-500">
                {entry.createdAt.toLocaleString()}
              </span>
              <span className="text-slate-700 dark:text-slate-300">
                {entry.event}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
