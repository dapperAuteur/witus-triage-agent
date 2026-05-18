import Image from "next/image";

/**
 * Day-1 landing page. Internal-tool styling — WitUS Inbox identity
 * (violet on slate). The real operator UI (/triage queue + run detail)
 * lands on Day 5. Mobile-first, both themes, keyboard-reachable.
 */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16 sm:py-24">
      <div className="w-full max-w-2xl">
        <Image
          src="/brand/witus/wordmark.svg"
          alt="WitUS"
          width={220}
          height={56}
          priority
          className="h-12 w-auto"
        />

        <h1 className="mt-8 text-3xl font-semibold tracking-tight sm:text-4xl">
          WitUS Triage Agent
        </h1>
        <p className="mt-3 max-w-prose text-base leading-7 text-slate-600 dark:text-slate-400">
          A LangGraph agent that classifies incoming WitUS Inbox submissions,
          enriches them with customer and product context, proposes an action,
          and routes through a human-in-the-loop approval gate before doing
          anything irreversible.
        </p>

        <section
          aria-label="Agent pipeline"
          className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Pipeline
          </h2>
          <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 font-mono text-sm">
            {[
              "classify",
              "enrich",
              "propose",
              "human approval",
              "execute",
            ].map((node, i, arr) => (
              <li key={node} className="flex items-center gap-2">
                <span className="rounded bg-violet-100 px-2 py-1 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                  {node}
                </span>
                {i < arr.length - 1 && (
                  <span aria-hidden="true" className="text-slate-400">
                    →
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-label="Build status"
          className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-500/10"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Day 1 — checkpoint
          </h2>
          <p className="mt-2 leading-6 text-slate-700 dark:text-slate-300">
            Drizzle schema, first migration, and the{" "}
            <code className="font-mono">classify</code> node are wired. The
            operator dashboard, approval gate, and remaining nodes land on
            later days. See{" "}
            <code className="font-mono">README.md</code> to run the graph
            locally.
          </p>
        </section>
      </div>
    </main>
  );
}
