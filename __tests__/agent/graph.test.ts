/**
 * Full graph — Day 4 test.
 *
 * Proves the human-in-the-loop pattern end to end:
 *   1. invoking the graph runs classify -> enrich -> propose, then PAUSES at
 *      the `interrupt()` in `human_approval` — no execution has happened;
 *   2. resuming with `new Command({ resume })` picks the exact same thread back
 *      up and runs it to a terminal node.
 *
 * This is the PRD's core acceptance check: "execution cannot occur without an
 * approved record." It needs both Postgres (checkpointer + enrich) and an LLM
 * key (classify + propose), so it is skipped when either is missing.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Command } from "@langchain/langgraph";
import { randomUUID } from "node:crypto";
import { getCheckpointer, closeCheckpointer } from "@/agent/checkpointer";
import { buildTriageGraph } from "@/agent/graph";
import { getDb, getPool } from "@/db/client";
import { submissions } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { RawSubmission } from "@/agent/schemas";

const hasDb = Boolean(process.env.STORAGE_DATABASE_URL);
const hasLlm = Boolean(
  process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY,
);
const canRun = hasDb && hasLlm;

/** Insert a real submission row so the `execute` node's tools have a target. */
async function seedSubmission(body: string): Promise<RawSubmission> {
  const db = getDb();
  const inserted = await db
    .insert(submissions)
    .values({
      source: "flashlearnai",
      formType: "contact-form",
      submitterEmail: "graph-test@example.com",
      submitterName: "Graph Test",
      payload: { message: body, _fixture: "graph-test" },
      priority: "normal",
      receivedVia: "manual",
    })
    .returning({ id: submissions.id, receivedAt: submissions.receivedAt });
  const row = inserted[0];
  return {
    submissionId: row.id,
    productSlug: "flashlearnai",
    formType: "contact-form",
    submittedAt: row.receivedAt.toISOString(),
    body,
    contactEmail: "graph-test@example.com",
    contactName: "Graph Test",
    priority: "normal",
  };
}

describe.skipIf(!canRun)("triage graph — human-in-the-loop", () => {
  const seededIds: string[] = [];

  beforeAll(async () => {
    await getCheckpointer();
  });

  afterAll(async () => {
    if (seededIds.length > 0) {
      const db = getDb();
      for (const id of seededIds) {
        await db.delete(submissions).where(eq(submissions.id, id));
      }
    }
    await closeCheckpointer();
    await getPool().end();
  });

  it(
    "pauses at human_approval, then runs execute when approved",
    async () => {
      const checkpointer = await getCheckpointer();
      const graph = buildTriageGraph(checkpointer);

      const raw = await seedSubmission(
        "How do I reset my review streak after missing a few days?",
      );
      seededIds.push(raw.submissionId);
      const config = { configurable: { thread_id: randomUUID() } };

      // 1. First invocation — runs to the interrupt and returns.
      await graph.invoke({ rawSubmission: raw }, config);

      const paused = await graph.getState(config);
      // The graph is parked at human_approval, with proposal made, nothing run.
      expect(paused.next).toContain("human_approval");
      expect(paused.values.proposedAction).toBeDefined();
      expect(paused.values.execution).toBeUndefined();
      expect(paused.values.approval).toBeUndefined();

      // 2. Resume the SAME thread with an approval.
      await graph.invoke(
        new Command({ resume: { decision: "approved" } }),
        config,
      );

      const done = await graph.getState(config);
      expect(done.next).toHaveLength(0);
      expect(done.values.approval?.decision).toBe("approved");
      expect(done.values.execution).toBeDefined();
      console.log(
        `[graph] approved -> action=${done.values.proposedAction?.type} ` +
          `execution=${done.values.execution?.result}`,
      );
    },
    180_000,
  );

  it(
    "routes to log_rejection when rejected — no execution side effects",
    async () => {
      const checkpointer = await getCheckpointer();
      const graph = buildTriageGraph(checkpointer);

      const raw = await seedSubmission(
        "Please add a CSV export for my study history.",
      );
      seededIds.push(raw.submissionId);
      const config = { configurable: { thread_id: randomUUID() } };

      await graph.invoke({ rawSubmission: raw }, config);

      const paused = await graph.getState(config);
      expect(paused.next).toContain("human_approval");

      await graph.invoke(
        new Command({
          resume: { decision: "rejected", operatorNote: "Handling manually." },
        }),
        config,
      );

      const done = await graph.getState(config);
      expect(done.next).toHaveLength(0);
      expect(done.values.approval?.decision).toBe("rejected");
      expect(done.values.approval?.operatorNote).toBe("Handling manually.");
      // log_rejection still records a clean terminal execution.
      expect(done.values.execution).toBeDefined();
    },
    180_000,
  );
});

describe.skipIf(canRun)("triage graph (skipped)", () => {
  it("is skipped without a database and an LLM key", () => {
    expect(canRun).toBe(false);
  });
});
