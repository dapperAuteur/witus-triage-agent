/**
 * `draftReply` tool.
 *
 * Drafts a customer-facing reply to a WitUS Inbox submission. Used by the
 * `propose` node when the recommended action is `auto_reply` or
 * `draft_for_human`. One small structured-output LLM call.
 *
 * Fail-soft: if the LLM call errors, it returns a placeholder draft rather
 * than throwing, so the `propose` node always has a payload to attach.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getChatModel } from "../model";
import { TRIAGE_CATEGORIES } from "../schemas";

export const DraftReplyInputSchema = z.object({
  submissionBody: z
    .string()
    .describe("The original submission text to reply to."),
  productSlug: z
    .string()
    .describe("The product the submission is about, e.g. 'flashlearnai'."),
  category: z
    .enum(TRIAGE_CATEGORIES)
    .describe("The submission's triage classification."),
  context: z
    .string()
    .describe(
      "Background the reply may draw on — customer history, product status.",
    ),
  tone: z
    .enum(["friendly", "professional", "apologetic", "concise"])
    .default("friendly")
    .describe("The tone the reply should take."),
});

export type DraftReplyInput = z.infer<typeof DraftReplyInputSchema>;

/** Structured output of the draft-reply LLM call. */
export const DraftReplyOutputSchema = z.object({
  draft: z.string().describe("The drafted reply, ready for operator review."),
  citations: z
    .array(z.string())
    .describe(
      "Short notes on any background context the draft relied on (may be empty).",
    ),
});

export type DraftReplyOutput = z.infer<typeof DraftReplyOutputSchema>;

const SYSTEM_PROMPT = `You draft replies to customer submissions for the WitUS product \
ecosystem. Write a reply the operator can review and send.

Rules:
- Match the requested tone.
- Be concise, specific, and genuinely helpful — no filler, no over-apologizing.
- Never invent facts, features, timelines, refunds, or policies. If something needs a
  human decision or information you do not have, say the team will follow up rather than
  guessing.
- Do not promise anything the operator has not approved.
- Sign off as "The WitUS team".

Return the drafted reply and, in "citations", short notes on any background context you
used (e.g. "referenced the customer's earlier streak question"). Leave citations empty if
the draft used none.`;

/**
 * The tool implementation, exported separately so it can be unit-tested and
 * called with a precise return type.
 */
export async function runDraftReply({
  submissionBody,
  productSlug,
  category,
  context,
  tone,
}: DraftReplyInput): Promise<DraftReplyOutput> {
  const userMessage = [
    `Product: ${productSlug}`,
    `Category: ${category}`,
    `Requested tone: ${tone}`,
    `Background context: ${context || "(none)"}`,
    "",
    "Submission to reply to:",
    submissionBody,
  ].join("\n");

  try {
    const model = getChatModel({ temperature: 0.3 }).withStructuredOutput(
      DraftReplyOutputSchema,
      { name: "draft_reply" },
    );
    return await model.invoke([
      ["system", SYSTEM_PROMPT],
      ["human", userMessage],
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return {
      draft:
        "(Automated draft generation failed — please write this reply manually.)",
      citations: [`draft_reply error: ${message}`],
    };
  }
}

export const draftReply = tool(runDraftReply, {
  name: "draft_reply",
  description:
    "Draft a customer-facing reply to a WitUS Inbox submission. Returns " +
    "{ draft, citations }. Use it for auto_reply and draft_for_human actions.",
  schema: DraftReplyInputSchema,
});
