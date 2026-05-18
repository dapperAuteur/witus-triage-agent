/**
 * `escalateSms` tool.
 *
 * Texts the operator about a submission that needs attention now. Used by the
 * `execute` node for an approved `escalate_sms` action. Wraps the ecosystem
 * Mobile Text Alerts integration (`lib/sms.ts`).
 *
 * This tool has a side effect (it sends a message) — it must only run from the
 * `execute` node, after operator approval.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { sendSms } from "@/lib/sms";

export const EscalateSmsInputSchema = z.object({
  message: z.string().min(1).describe("The SMS body to send to the operator."),
  reason: z
    .string()
    .describe("Why this submission is being escalated (for the audit trail)."),
});

export type EscalateSmsInput = z.infer<typeof EscalateSmsInputSchema>;

export interface EscalateSmsResult {
  success: boolean;
  messageId?: string;
}

/** The tool implementation, exported separately for typed direct calls + tests. */
export async function runEscalateSms({
  message,
}: EscalateSmsInput): Promise<EscalateSmsResult> {
  const result = await sendSms({ text: message });
  return {
    success: result.ok,
    messageId: result.detail,
  };
}

export const escalateSms = tool(runEscalateSms, {
  name: "escalate_sms",
  description:
    "Send an SMS alert to the operator about an urgent submission. Returns " +
    "{ success, messageId? }. Side-effecting — execute-node use only.",
  schema: EscalateSmsInputSchema,
});
