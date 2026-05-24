/**
 * `propose` node — the third node in the graph.
 *
 * Recommends an action for the operator to approve. Two steps:
 *   1. One structured-output LLM call picks the action `type` + `reasoning`.
 *   2. The node deterministically assembles the `payload` for that type. For
 *      `auto_reply` / `draft_for_human` that means invoking the `draftReply`
 *      tool — so a reply-type run always exercises a third tool.
 *
 * Keeping `payload` out of the LLM call (the model only chooses `type`) avoids
 * open-ended structured output and keeps the payload predictable and testable.
 *
 * Pure: reads `classification` / `enrichment` / `rawSubmission`, returns only
 * `{ proposedAction }`. Fail-soft — any error becomes a `no_action` proposal.
 */
import { z } from "zod";
import { buildChatModelWithFallback } from "../with-fallback";
import { draftReply } from "../tools/draftReply";
import { ACTION_TYPES, type ProposedAction } from "../schemas";
import type { TriageState, TriageStateUpdate } from "../state";

/** What the LLM returns — just the decision, not the payload. */
const ProposeDecisionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  reasoning: z.string(),
});

const SYSTEM_PROMPT = `You triage WitUS Inbox submissions. A classifier and an enrichment \
step have already run; your job is to recommend ONE action for the human operator to
approve. You do not execute anything — you propose.

Choose exactly one action type:

- auto_reply — a simple, low-risk reply can safely be sent with only a quick operator
  glance. Use only for straightforward support questions answerable without a decision.
- draft_for_human — draft a reply, but a human should review and send it. The default
  for most support questions and for acknowledging bug reports.
- escalate_sms — text the operator now. Use for anything urgent or sensitive: high
  priority, a product in "red" status, billing problems, or abuse.
- file_in_kb — no reply needed; record it for later. Use for feature requests and
  general praise or commentary.
- mark_spam — the submission is spam; file it away with no reply.
- no_action — nothing is warranted.

Weigh the classification, the model's confidence, the product's status, and the
customer's history. Give a one- or two-sentence "reasoning".`;

/** Render the upstream state into a compact prompt context block. */
function buildContext(state: TriageState): string {
  const { classification, enrichment, rawSubmission } = state;
  const lines = [
    `Product: ${rawSubmission.productSlug}`,
    `Priority flag: ${rawSubmission.priority}`,
  ];
  if (classification) {
    lines.push(
      `Classification: ${classification.category} ` +
        `(confidence ${classification.confidence}) — ${classification.rationale}`,
    );
  }
  if (enrichment) {
    lines.push(
      `Product status: ${enrichment.productStatus}`,
      `Customer tenure: ${enrichment.customerTenure}`,
      `Past submissions: ${enrichment.pastSubmissions.length}`,
    );
  }
  lines.push("", "Submission text:", rawSubmission.body);
  return lines.join("\n");
}

/** Background string handed to the draftReply tool. */
function buildDraftContext(state: TriageState): string {
  const { enrichment } = state;
  if (!enrichment) return "";
  const parts = [
    `Customer tenure: ${enrichment.customerTenure}.`,
    `Product status: ${enrichment.productStatus}.`,
  ];
  if (enrichment.pastSubmissions.length > 0) {
    parts.push(
      `Prior submissions: ${enrichment.pastSubmissions
        .map((p) => p.summary)
        .join(" | ")}`,
    );
  }
  return parts.join(" ");
}

/** Deterministically assemble the action payload for the chosen type. */
async function buildPayload(
  type: ProposedAction["type"],
  state: TriageState,
  reasoning: string,
): Promise<Record<string, unknown>> {
  const { classification, rawSubmission } = state;
  const category = classification?.category ?? "other";

  switch (type) {
    case "auto_reply":
    case "draft_for_human": {
      const tone = category === "billing_issue" ? "apologetic" : "friendly";
      const { draft, citations } = await draftReply.invoke({
        submissionBody: rawSubmission.body,
        productSlug: rawSubmission.productSlug,
        category,
        context: buildDraftContext(state),
        tone,
      });
      return { draft, citations, tone };
    }
    case "escalate_sms":
      return {
        message:
          `WitUS triage: ${category} on ${rawSubmission.productSlug} ` +
          `needs attention.`,
        reason: reasoning,
      };
    case "file_in_kb":
      return {
        folder: category,
        suggestedTags: [category, rawSubmission.productSlug],
      };
    case "mark_spam":
    case "no_action":
      return {};
    default:
      return {};
  }
}

export async function propose(state: TriageState): Promise<TriageStateUpdate> {
  if (!state.classification) {
    return {
      proposedAction: {
        type: "no_action",
        payload: {},
        reasoning: "No classification available; cannot propose an action.",
      },
    };
  }

  try {
    const model = (
      await buildChatModelWithFallback({ node: "propose", temperature: 0 })
    ).withStructuredOutput(ProposeDecisionSchema, {
      name: "propose_action",
    });
    const decision = await model.invoke([
      ["system", SYSTEM_PROMPT],
      ["human", buildContext(state)],
    ]);

    const payload = await buildPayload(decision.type, state, decision.reasoning);

    return {
      proposedAction: {
        type: decision.type,
        payload,
        reasoning: decision.reasoning,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return {
      proposedAction: {
        type: "no_action",
        payload: {},
        reasoning: `Proposal failed; defaulted to no_action. ${message}`,
      },
    };
  }
}
