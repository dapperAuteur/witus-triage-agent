/**
 * The triage graph.
 *
 * Day 1 — skeleton: only the `classify` node is wired (START -> classify -> END).
 * Later days add enrich, propose, the human_approval interrupt, execute, and
 * log_rejection, plus the Postgres checkpointer that makes the human-in-the-loop
 * pause survive across HTTP requests.
 *
 * Keeping the graph in one small, readable file is deliberate — it is meant to
 * be read end-to-end (PRD: "small enough to read in one sitting").
 */
import { StateGraph, START, END } from "@langchain/langgraph";
import { TriageStateAnnotation } from "./state";
import { classify } from "./nodes/classify";

/** Build and compile the triage graph. */
export function buildTriageGraph() {
  return new StateGraph(TriageStateAnnotation)
    .addNode("classify", classify)
    .addEdge(START, "classify")
    .addEdge("classify", END)
    .compile();
}

/** The compiled, ready-to-invoke triage graph. */
export const triageGraph = buildTriageGraph();
