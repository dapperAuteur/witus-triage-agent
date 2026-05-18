import "server-only";
import { Command } from "@langchain/langgraph";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { submissions, triageRuns, triageAuditLog } from "@/db/schema";
import type { TriageRun } from "@/db/schema";
import { getCompiledTriageGraph } from "@/agent/graph";
import {
  ApprovalDecisionInputSchema,
  type ApprovalDecisionInput,
  type RawSubmission,
} from "@/agent/schemas";
import type { TriageState } from "@/agent/state";

/**
 * Triage run orchestration — the bridge between the HTTP routes and the graph.
 *
 *   startRun  — stores the submission, opens a `triage_runs` row, invokes the
 *               graph until it pauses at `human_approval`.
 *   resumeRun — resumes the paused thread with the operator's decision and
 *               runs it to a terminal node.
 *
 * The `triage_runs.id` doubles as the LangGraph `thread_id`: one run == one
 * durable thread, so a resume needs nothing but the run id.
 *
 * Audit-log rows are written here, after each `invoke()` resolves — never from
 * inside graph nodes, which stay pure (STYLEGUIDE §3).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Webhook body accepted by POST /api/triage/start (sent by WitUS Inbox). */
export const StartRunInputSchema = z.object({
  submissionId: z.string().optional(),
  source: z.string().min(1),
  formType: z.string().min(1),
  submitterEmail: z.string().email().optional(),
  submitterName: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
  priority: z.enum(["normal", "high"]).default("normal"),
  receivedAt: z.string().optional(),
});
export type StartRunInput = z.infer<typeof StartRunInputSchema>;

/** Flatten a submission's jsonb payload into a single human-readable body. */
function flattenPayloadToBody(payload: Record<string, unknown>): string {
  const subject = typeof payload.subject === "string" ? payload.subject : "";
  const message = typeof payload.message === "string" ? payload.message : "";
  const combined = [subject, message].filter((s) => s.length > 0).join("\n\n");
  if (combined.length > 0) return combined;
  // Fall back to the whole payload minus internal markers.
  const visible = Object.fromEntries(
    Object.entries(payload).filter(([k]) => !k.startsWith("_")),
  );
  return JSON.stringify(visible);
}

/** Append an audit-log row. Best-effort — never throws into the caller. */
async function writeAudit(
  runId: string,
  event: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  try {
    await getDb()
      .insert(triageAuditLog)
      .values({ runId, event, payload: payload ?? null });
  } catch (err) {
    const code = err instanceof Error ? err.name : "UnknownError";
    console.error("[triage] audit write failed event=%s err=%s", event, code);
  }
}

export interface StartRunResult {
  runId: string;
  status: TriageRun["status"];
}

/** Store the submission, open a run, and drive the graph to the approval gate. */
export async function startRun(input: StartRunInput): Promise<StartRunResult> {
  const db = getDb();

  // 1. Upsert the submission into this app's own `submission` table.
  let submissionId = input.submissionId;
  const submissionValues = {
    source: input.source,
    formType: input.formType,
    submitterEmail: input.submitterEmail ?? null,
    submitterName: input.submitterName ?? null,
    payload: input.payload,
    priority: input.priority,
    receivedVia: "webhook" as const,
  };
  if (submissionId && UUID_RE.test(submissionId)) {
    await db
      .insert(submissions)
      .values({ id: submissionId, ...submissionValues })
      .onConflictDoNothing();
  } else {
    const inserted = await db
      .insert(submissions)
      .values(submissionValues)
      .returning({ id: submissions.id });
    submissionId = inserted[0].id;
  }

  // 2. Open the triage run. Its id is the LangGraph thread_id.
  const langsmithRunId = randomUUID();
  const opened = await db
    .insert(triageRuns)
    .values({ submissionId, status: "running", langsmithRunId })
    .returning({ id: triageRuns.id });
  const runId = opened[0].id;
  await writeAudit(runId, "started", { submissionId });

  // 3. Invoke the graph — it runs classify -> enrich -> propose, then pauses
  //    at the human_approval interrupt and returns.
  const rawSubmission: RawSubmission = {
    submissionId,
    productSlug: input.source,
    formType: input.formType,
    submittedAt: input.receivedAt ?? new Date().toISOString(),
    body: flattenPayloadToBody(input.payload),
    contactEmail: input.submitterEmail,
    contactName: input.submitterName,
    priority: input.priority,
  };
  const config = {
    configurable: { thread_id: runId },
    runId: langsmithRunId,
  };

  try {
    const graph = await getCompiledTriageGraph();
    await graph.invoke({ rawSubmission }, config);
    const state = (await graph.getState(config)).values as TriageState;

    await db
      .update(triageRuns)
      .set({
        status: "pending_approval",
        classification: state.classification,
        enrichment: state.enrichment,
        proposedAction: state.proposedAction,
        updatedAt: new Date(),
      })
      .where(eq(triageRuns.id, runId));

    if (state.classification) {
      await writeAudit(runId, "classified", {
        category: state.classification.category,
      });
    }
    if (state.enrichment) await writeAudit(runId, "enriched");
    if (state.proposedAction) {
      await writeAudit(runId, "proposed", {
        type: state.proposedAction.type,
      });
    }

    return { runId, status: "pending_approval" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    await db
      .update(triageRuns)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(triageRuns.id, runId));
    await writeAudit(runId, "failed", { stage: "start", message });
    return { runId, status: "failed" };
  }
}

/** Resume a paused run with the operator's decision and run it to the end. */
export async function resumeRun(
  runId: string,
  decisionInput: ApprovalDecisionInput,
): Promise<TriageRun> {
  if (!UUID_RE.test(runId)) {
    throw new TriageRunError("not_found", "Run not found.");
  }
  const decision = ApprovalDecisionInputSchema.parse(decisionInput);
  const db = getDb();

  const existing = await db
    .select()
    .from(triageRuns)
    .where(eq(triageRuns.id, runId))
    .limit(1);
  const run = existing[0];
  if (!run) {
    throw new TriageRunError("not_found", "Run not found.");
  }
  // Idempotency gate — only a run still waiting can be decided.
  if (run.status !== "pending_approval") {
    throw new TriageRunError(
      "conflict",
      `Run is already '${run.status}'; it cannot be decided again.`,
    );
  }

  const config = { configurable: { thread_id: runId } };

  try {
    const graph = await getCompiledTriageGraph();
    await graph.invoke(new Command({ resume: decision }), config);
    const state = (await graph.getState(config)).values as TriageState;

    const rejected = decision.decision === "rejected";
    const failed = state.execution?.result === "failed";
    const status: TriageRun["status"] = rejected
      ? "rejected"
      : failed
        ? "failed"
        : "executed";

    const updated = await db
      .update(triageRuns)
      .set({
        status,
        approval: state.approval,
        execution: state.execution,
        updatedAt: new Date(),
      })
      .where(eq(triageRuns.id, runId))
      .returning();

    await writeAudit(runId, rejected ? "rejected" : "executed", {
      decision: decision.decision,
      result: state.execution?.result,
    });
    return updated[0];
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    const updated = await db
      .update(triageRuns)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(triageRuns.id, runId))
      .returning();
    await writeAudit(runId, "failed", { stage: "resume", message });
    return updated[0];
  }
}

/** A typed error so routes can map to the right HTTP status. */
export class TriageRunError extends Error {
  constructor(
    public readonly kind: "not_found" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "TriageRunError";
  }
}
