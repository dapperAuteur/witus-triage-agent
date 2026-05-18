/**
 * `human_approval` node — the human-in-the-loop gate.
 *
 * Calls `interrupt()` to pause the graph and surface the proposal for operator
 * review. The Postgres checkpointer persists the paused state, so the pause
 * survives across HTTP requests and process restarts. When the graph is
 * resumed with `new Command({ resume })`, `interrupt()` returns that resume
 * value and the node finishes.
 *
 * IMPORTANT: a node containing `interrupt()` re-runs from its first line on
 * resume. This node therefore does nothing but `interrupt()` and shape the
 * result — no DB writes, no non-idempotent work before the interrupt.
 */
import { interrupt } from "@langchain/langgraph";
import { ApprovalDecisionInputSchema } from "../schemas";
import type { TriageState, TriageStateUpdate } from "../state";

export function humanApproval(state: TriageState): TriageStateUpdate {
  // First run: throws an interrupt signal — the graph pauses here.
  // Resumed run: returns the value from `new Command({ resume })`.
  const resumeValue = interrupt({
    kind: "approval_request",
    classification: state.classification,
    enrichment: state.enrichment,
    proposedAction: state.proposedAction,
  });

  const decision = ApprovalDecisionInputSchema.parse(resumeValue);

  return {
    approval: {
      decision: decision.decision,
      editedPayload: decision.editedPayload,
      operatorNote: decision.operatorNote,
      decidedAt: new Date().toISOString(),
    },
  };
}
