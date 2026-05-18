/**
 * The triage graph.
 *
 * Day 4 — the full graph:
 *
 *   START -> classify -> enrich -> propose -> human_approval
 *                                                  |
 *                              approved / edited ---+--- rejected
 *                                   |                       |
 *                                execute              log_rejection
 *                                   |                       |
 *                                  END                     END
 *
 * `human_approval` calls `interrupt()`, so the graph must be compiled WITH the
 * Postgres checkpointer for the pause to be durable. `buildTriageGraph()` takes
 * an optional checkpointer; `getCompiledTriageGraph()` is the lazy, cached
 * accessor the API routes use.
 *
 * Keeping the graph in one small, readable file is deliberate — it is meant to
 * be read end-to-end (PRD: "small enough to read in one sitting").
 */
import { StateGraph, START, END } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { TriageStateAnnotation, type TriageState } from "./state";
import { classify } from "./nodes/classify";
import { enrich } from "./nodes/enrich";
import { propose } from "./nodes/propose";
import { humanApproval } from "./nodes/humanApproval";
import { execute } from "./nodes/execute";
import { logRejection } from "./nodes/logRejection";
import { getCheckpointer } from "./checkpointer";

/** Conditional edge after `human_approval` — rejection branches off. */
function routeAfterApproval(state: TriageState): "execute" | "log_rejection" {
  return state.approval?.decision === "rejected" ? "log_rejection" : "execute";
}

/** Build and compile the triage graph, optionally with a checkpointer. */
export function buildTriageGraph(checkpointer?: BaseCheckpointSaver) {
  const builder = new StateGraph(TriageStateAnnotation)
    .addNode("classify", classify)
    .addNode("enrich", enrich)
    .addNode("propose", propose)
    .addNode("human_approval", humanApproval)
    .addNode("execute", execute)
    .addNode("log_rejection", logRejection)
    .addEdge(START, "classify")
    .addEdge("classify", "enrich")
    .addEdge("enrich", "propose")
    .addEdge("propose", "human_approval")
    .addConditionalEdges("human_approval", routeAfterApproval, [
      "execute",
      "log_rejection",
    ])
    .addEdge("execute", END)
    .addEdge("log_rejection", END);

  return builder.compile(checkpointer ? { checkpointer } : undefined);
}

type CompiledTriageGraph = ReturnType<typeof buildTriageGraph>;

let cachedGraph: CompiledTriageGraph | null = null;

/**
 * The compiled graph wired to the Postgres checkpointer. Lazy + cached — the
 * checkpointer's one-time `setup()` runs on first call. API routes use this.
 */
export async function getCompiledTriageGraph(): Promise<CompiledTriageGraph> {
  if (cachedGraph) return cachedGraph;
  const checkpointer = await getCheckpointer();
  cachedGraph = buildTriageGraph(checkpointer);
  return cachedGraph;
}
