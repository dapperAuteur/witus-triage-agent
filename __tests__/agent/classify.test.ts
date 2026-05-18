/**
 * classify node — Day 1 test.
 *
 * Runs the `classify` node against 5 hand-labeled fixture submissions and
 * asserts each produces a structurally valid classification: a known category,
 * a confidence in [0, 1], and a non-empty rationale. This also verifies that
 * `.withStructuredOutput()` (Zod v4 schema -> Anthropic tool call) works with
 * the installed @langchain/* versions.
 *
 * It makes a live LLM call (Gemini for testing, Claude for production), so the
 * suite is skipped when neither GEMINI_API_KEY nor ANTHROPIC_API_KEY is set
 * (CI without a key stays green).
 *
 * Category-accuracy (>= 80%) is a Day-7 acceptance check, not asserted here —
 * but expected vs. actual is logged so drift is visible early.
 */
import { describe, it, expect } from "vitest";
import { classify } from "@/agent/nodes/classify";
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

/** Adapt a fixture into the agent's `RawSubmission` shape. */
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

/** A fresh graph state with only `rawSubmission` populated. */
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

// 5 fixtures spanning distinct categories.
const samples = ["fixture-01", "fixture-02", "fixture-03", "fixture-04", "fixture-05"]
  .map((id) => fixtures.find((f) => f.id === id))
  .filter((f): f is Fixture => f !== undefined);

const hasApiKey = Boolean(
  process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY,
);

describe("classify fixtures", () => {
  it("provides 5 distinct sample fixtures", () => {
    expect(samples).toHaveLength(5);
    expect(new Set(samples.map((f) => f.expectedCategory)).size).toBe(5);
  });
});

describe.skipIf(!hasApiKey)("classify node", () => {
  for (const fixture of samples) {
    it(`classifies ${fixture.id} into a valid category`, async () => {
      const update = await classify(makeState(toRawSubmission(fixture)));

      const classification = update.classification;
      expect(classification).toBeDefined();
      if (!classification) return;

      // Structural assertions — the Day-1 bar.
      expect(TRIAGE_CATEGORIES).toContain(classification.category);
      expect(classification.confidence).toBeGreaterThanOrEqual(0);
      expect(classification.confidence).toBeLessThanOrEqual(1);
      expect(classification.rationale.trim().length).toBeGreaterThan(0);

      // Informational — accuracy is a Day-7 check, not a Day-1 assertion.
      const match =
        classification.category === fixture.expectedCategory ? "✓" : "✗";
      console.log(
        `[classify] ${fixture.id}: expected=${fixture.expectedCategory} ` +
          `actual=${classification.category} ${match} ` +
          `(confidence ${classification.confidence})`,
      );
      console.log(`[classify]   rationale: ${classification.rationale}`);
    });
  }
});

describe.skipIf(hasApiKey)("classify node (skipped)", () => {
  it("is skipped without an LLM API key", () => {
    console.warn(
      "[classify.test] neither GEMINI_API_KEY nor ANTHROPIC_API_KEY set — " +
        "live classification tests skipped.",
    );
    expect(hasApiKey).toBe(false);
  });
});
