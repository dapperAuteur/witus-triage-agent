import "server-only";
import { getEnv } from "./env";

/**
 * LangSmith helpers — fail-soft observability.
 *
 * Tracing activates purely from env vars (`LANGSMITH_TRACING`,
 * `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`) that the LangChain SDK reads on its
 * own — there is no client to wire. These helpers just let the UI decide
 * whether to show an "Open in LangSmith" link. The app runs fine with none of
 * the LangSmith vars set (PRD §15: fail soft).
 */

/** True only when tracing is switched on AND an API key is present. */
export function isTracingEnabled(): boolean {
  const env = getEnv();
  return env.LANGSMITH_TRACING === "true" && Boolean(env.LANGSMITH_API_KEY);
}

/**
 * A link to LangSmith for a given run, or `null` when tracing is not
 * configured (the UI then hides the link). The deployed app cannot build a
 * deep link without the workspace id, so this points at the LangSmith app;
 * the run page also shows the raw `langsmithRunId` to search for.
 */
export function getLangsmithRunUrl(runId: string | null): string | null {
  if (!runId || !isTracingEnabled()) return null;
  return "https://smith.langchain.com";
}
