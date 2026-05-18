/**
 * `log_rejection` node — the terminal node for a rejected proposal.
 *
 * Reached when the operator rejects the agent's recommendation. The agent does
 * not execute anything; a human will handle the submission directly. This node
 * just records that the run closed as a rejection — the API route writes the
 * audit-log row and sets the run's status.
 *
 * One of the two nodes allowed side effects, though for v1 it has none beyond
 * shaping the terminal state.
 */
import type { TriageStateUpdate } from "../state";

export function logRejection(): TriageStateUpdate {
  return {
    execution: {
      executedAt: new Date().toISOString(),
      // "success" here means the rejection was recorded cleanly; the
      // `approval.decision === "rejected"` field is what marks it a rejection.
      result: "success",
    },
  };
}
