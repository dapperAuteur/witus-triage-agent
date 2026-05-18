/**
 * `execute` node — runs the approved action.
 *
 * Reached only after `human_approval` records an `approved` or `edited`
 * decision, so by construction nothing here runs without operator approval.
 * This is one of the two nodes allowed side effects.
 *
 * When the operator edited the proposal, `approval.editedPayload` takes
 * precedence over the original `proposedAction.payload`.
 *
 * Every branch is wrapped so a failure becomes `execution.result === "failed"`
 * with a message, rather than crashing the graph.
 */
import { escalateSms } from "../tools/escalateSms";
import { tagAndFile } from "../tools/tagAndFile";
import type { TriageState, TriageStateUpdate } from "../state";

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export async function execute(state: TriageState): Promise<TriageStateUpdate> {
  const executedAt = new Date().toISOString();
  const { proposedAction, approval, rawSubmission } = state;

  if (!proposedAction) {
    return {
      execution: {
        executedAt,
        result: "failed",
        errorMessage: "No proposed action to execute.",
      },
    };
  }

  // Operator edits win over the original proposal payload.
  const payload =
    approval?.decision === "edited" && approval.editedPayload
      ? approval.editedPayload
      : proposedAction.payload;

  try {
    switch (proposedAction.type) {
      case "escalate_sms": {
        const result = await escalateSms.invoke({
          message: asString(
            payload.message,
            `WitUS triage: ${rawSubmission.productSlug} needs attention.`,
          ),
          reason: asString(payload.reason, proposedAction.reasoning),
        });
        if (!result.success) {
          throw new Error(`SMS escalation failed (${result.messageId})`);
        }
        break;
      }

      case "file_in_kb": {
        const result = await tagAndFile.invoke({
          submissionId: rawSubmission.submissionId,
          tags: Array.isArray(payload.suggestedTags)
            ? payload.suggestedTags.map(String)
            : [],
          folder: asString(payload.folder, "uncategorized"),
        });
        if (!result.success) {
          throw new Error("Could not file the submission (not found).");
        }
        break;
      }

      case "mark_spam": {
        const result = await tagAndFile.invoke({
          submissionId: rawSubmission.submissionId,
          tags: ["spam"],
          folder: "spam",
        });
        if (!result.success) {
          throw new Error("Could not file the submission as spam (not found).");
        }
        break;
      }

      case "auto_reply":
      case "draft_for_human":
        // v1: the drafted reply lives on the proposal for the operator (and,
        // ultimately, WitUS Inbox) to send. No reply-send integration here.
        break;

      case "no_action":
        break;
    }

    return { execution: { executedAt, result: "success" } };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "unknown error";
    return { execution: { executedAt, result: "failed", errorMessage } };
  }
}
