import Link from "next/link";
import { Card } from "@/components/ui/card";
import { RunStatusBadge, CategoryBadge } from "@/components/run-badges";
import type { Classification } from "@/agent/schemas";

export interface RunListItem {
  id: string;
  status: string;
  classification: Classification | null;
  createdAt: Date;
  source: string;
  submitterName: string | null;
}

/** Shared list of triage runs — used by both the queue and the history page. */
export function RunList({
  runs,
  emptyMessage,
}: {
  runs: RunListItem[];
  emptyMessage: string;
}) {
  if (runs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {runs.map((run) => (
        <li key={run.id}>
          <Link
            href={`/triage/${run.id}`}
            className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
          >
            <Card className="transition-colors hover:border-violet-400">
              <div className="flex flex-wrap items-center gap-2">
                <RunStatusBadge status={run.status} />
                {run.classification && (
                  <CategoryBadge category={run.classification.category} />
                )}
                <span className="font-mono text-xs text-slate-500">
                  {run.source}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                {run.submitterName ?? "Unknown sender"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {run.createdAt.toLocaleString()}
              </p>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
