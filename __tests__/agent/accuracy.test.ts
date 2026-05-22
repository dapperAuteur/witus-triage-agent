/**
 * Classification accuracy eval — PRD acceptance criterion #5.
 *
 * Runs the `classify` node against all 25 hand-labeled fixture submissions and
 * asserts overall accuracy >= 80%. It also writes a fresh EVAL.md report.
 *
 * This makes 25 live LLM calls, so it is gated behind RUN_EVAL — a normal
 * `npm test` skips it instantly. Run it deliberately:
 *
 *   npm run eval
 *
 * Calls are paced (EVAL_DELAY_MS, default 15s) to stay under the Gemini free
 * tier's per-minute limit — gemini-2.5-flash free tier allows only 5
 * requests/minute, so calls must be >= 12s apart.
 *
 * HONEST-FAILURE GUARANTEE: `classify` is fail-soft — on any LLM error (a 429,
 * a network blip, a bad key) it returns an `other` / confidence-0 fallback.
 * That is correct for production but would let an infrastructure outage be
 * scored as if it were a real (bad) measurement. So the eval detects that
 * fallback and ABORTS LOUDLY on the first one — it never writes a fake
 * percentage to EVAL.md. A run either produces a real number or fails.
 */
import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { classify, CLASSIFY_FAILSOFT_PREFIX } from "@/agent/nodes/classify";
import { activeModelId } from "@/agent/model";
import { TRIAGE_CATEGORIES, type RawSubmission } from "@/agent/schemas";
import type { TriageState } from "@/agent/state";
import fixturesData from "../fixtures/submissions.json";

interface Fixture {
  id: string;
  source: string;
  formType: string;
  submitterEmail?: string;
  submitterName?: string;
  priority: "normal" | "high";
  payload: { subject?: string; message?: string } & Record<string, unknown>;
  expectedCategory: string;
}

const fixtures = (fixturesData as { submissions: Fixture[] }).submissions;

function toRawSubmission(f: Fixture): RawSubmission {
  const body = [f.payload.subject, f.payload.message]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .join("\n\n");
  return {
    submissionId: f.id,
    productSlug: f.source,
    formType: f.formType,
    submittedAt: new Date().toISOString(),
    body,
    contactEmail: f.submitterEmail,
    contactName: f.submitterName,
    priority: f.priority,
  };
}

function makeState(rawSubmission: RawSubmission): TriageState {
  return {
    rawSubmission,
    classification: undefined,
    enrichment: undefined,
    proposedAction: undefined,
    approval: undefined,
    execution: undefined,
  };
}

interface Result {
  id: string;
  expected: string;
  actual: string;
  confidence: number;
  correct: boolean;
}

const enabled =
  Boolean(process.env.RUN_EVAL) &&
  Boolean(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);

describe.skipIf(!enabled)("classification accuracy eval", () => {
  it(
    "classifies the 25-fixture set with >= 80% accuracy",
    async () => {
      const results: Result[] = [];
      const modelId = await activeModelId();
      // 15s default: gemini-2.5-flash free tier is 5 req/min, so >= 12s apart.
      const delayMs = Number(process.env.EVAL_DELAY_MS ?? "15000");

      // Sequential + paced — kinder to rate limits than parallel fan-out.
      for (const fixture of fixtures) {
        if (results.length > 0 && delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        const update = await classify(makeState(toRawSubmission(fixture)));
        const actual = update.classification?.category ?? "other";
        const confidence = update.classification?.confidence ?? 0;
        const rationale = update.classification?.rationale ?? "";

        // Honest-failure guard: a confidence-0 result carrying the fail-soft
        // prefix is an infrastructure error, not a measurement. Abort loudly.
        if (confidence === 0 && rationale.startsWith(CLASSIFY_FAILSOFT_PREFIX)) {
          const error = rationale.slice(CLASSIFY_FAILSOFT_PREFIX.length).trim();
          writeAbortedReport(
            fixture.id,
            error,
            results.length,
            fixtures.length,
            modelId,
          );
          throw new Error(
            `Eval aborted: infrastructure failure on ${fixture.id} — ${error} — ` +
              `${results.length}/${fixtures.length} completed. This is NOT a ` +
              `measurement; re-run on a working provider (see EVAL.md).`,
          );
        }

        const correct = actual === fixture.expectedCategory;
        results.push({
          id: fixture.id,
          expected: fixture.expectedCategory,
          actual,
          confidence,
          correct,
        });
        expect(TRIAGE_CATEGORIES).toContain(actual);
      }

      const correctCount = results.filter((r) => r.correct).length;
      const accuracy = correctCount / results.length;

      writeEvalReport(results, accuracy, modelId);

      console.log(
        `[eval] accuracy ${(accuracy * 100).toFixed(1)}% ` +
          `(${correctCount}/${results.length}) — see EVAL.md`,
      );

      expect(accuracy).toBeGreaterThanOrEqual(0.8);
    },
    900_000,
  );
});

describe.skipIf(enabled)("classification accuracy eval (skipped)", () => {
  it("is skipped — run `npm run eval` to measure accuracy", () => {
    expect(enabled).toBe(false);
  });
});

/** Write EVAL.md for a completed run — the most recent accuracy report. */
function writeEvalReport(
  results: Result[],
  accuracy: number,
  modelId: string,
): void {
  const correctCount = results.filter((r) => r.correct).length;

  const perCategory = new Map<string, { total: number; correct: number }>();
  for (const r of results) {
    const bucket = perCategory.get(r.expected) ?? { total: 0, correct: 0 };
    bucket.total += 1;
    if (r.correct) bucket.correct += 1;
    perCategory.set(r.expected, bucket);
  }

  const lines: string[] = [
    "# Classification accuracy — EVAL.md",
    "",
    "Generated by `npm run eval` (`__tests__/agent/accuracy.test.ts`).",
    "",
    `- **Status:** measured`,
    `- **Date:** ${new Date().toISOString()}`,
    `- **Model:** ${modelId}`,
    `- **Overall accuracy:** ${(accuracy * 100).toFixed(1)}% (${correctCount}/${results.length})`,
    `- **PRD bar:** ≥ 80% — ${accuracy >= 0.8 ? "PASS" : "FAIL"}`,
    "",
    "## By category",
    "",
    "| Category | Correct | Total |",
    "|----------|---------|-------|",
    ...[...perCategory.entries()].map(
      ([cat, b]) => `| ${cat} | ${b.correct} | ${b.total} |`,
    ),
    "",
    "## Per fixture",
    "",
    "| Fixture | Expected | Actual | Confidence | |",
    "|---------|----------|--------|------------|--|",
    ...results.map(
      (r) =>
        `| ${r.id} | ${r.expected} | ${r.actual} | ${r.confidence} | ${r.correct ? "✓" : "✗"} |`,
    ),
    "",
  ];

  writeFileSync(join(process.cwd(), "EVAL.md"), lines.join("\n"), "utf8");
}

/**
 * Write EVAL.md for an ABORTED run. Records the failure with no percentage —
 * distinguishing an infrastructure failure from a model failure is itself the
 * point (this repo doubles as a teaching artifact).
 */
function writeAbortedReport(
  fixtureId: string,
  error: string,
  completed: number,
  total: number,
  modelId: string,
): void {
  const lines: string[] = [
    "# Classification accuracy — EVAL.md",
    "",
    "Generated by `npm run eval` (`__tests__/agent/accuracy.test.ts`).",
    "",
    "- **Status:** aborted — infrastructure failure",
    `- **Date:** ${new Date().toISOString()}`,
    `- **Model:** ${modelId}`,
    `- **Failed at:** ${fixtureId} (after ${completed}/${total} fixtures)`,
    `- **Error:** ${error}`,
    "",
    "This run is **not a measurement**. The `classify` node is fail-soft: an",
    "LLM error (e.g. a 429 quota error, a bad key, a network blip) becomes an",
    "`other` / confidence-0 fallback. Folding that into an accuracy percentage",
    "would report an infrastructure outage as if it were a bad classifier. The",
    "eval detects the fallback and aborts instead.",
    "",
    "Re-run `npm run eval` on a working provider — fresh Gemini daily quota, or",
    "`TRIAGE_LLM_PROVIDER=anthropic` with a funded Anthropic key.",
    "",
  ];

  writeFileSync(join(process.cwd(), "EVAL.md"), lines.join("\n"), "utf8");
}
