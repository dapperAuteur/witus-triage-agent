/**
 * The triage graph.
 *
 * Day 3 — START -> classify -> enrich -> propose -> END.
 * Later days add the human_approval interrupt, execute, and log_rejection,
 * plus the Postgres checkpointer that makes the human-in-the-loop pause
 * survive across HTTP requests.
 *
 * Keeping the graph in one small, readable file is deliberate — it is meant to
 * be read end-to-end (PRD: "small enough to read in one sitting").
 */
import { StateGraph, START, END } from "@langchain/langgraph";
import { TriageStateAnnotation } from "./state";
import { classify } from "./nodes/classify";
import { enrich } from "./nodes/enrich";
import { propose } from "./nodes/propose";

/** Build and compile the triage graph. */
export function buildTriageGraph() {
  return new StateGraph(TriageStateAnnotation)
    .addNode("classify", classify)
    .addNode("enrich", enrich)
    .addNode("propose", propose)
    .addEdge(START, "classify")
    .addEdge("classify", "enrich")
    .addEdge("enrich", "propose")
    .addEdge("propose", END)
    .compile();
}

/** The compiled, ready-to-invoke triage graph. */
export const triageGraph = buildTriageGraph();
