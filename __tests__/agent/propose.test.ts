/**
 * propose node + draftReply tool — Day 3 test.
 *
 * The "no classification" path is pure (no LLM) and always runs. The rest make
 * a live LLM call, so they are skipped when neither GEMINI_API_KEY nor
 * ANTHROPIC_API_KEY is set.
 */
import { describe, it, expect } from "vitest";
import { propose } from "@/agent/nodes/propose";
import { draftReply } from "@/agent/tools/draftReply";
import {
  ACTION_TYPES,
  ProposedActionSchema,
  type Classification,
  type Enrichment,
  type RawSubmission,
} from "@/agent/schemas";
import type { TriageState } from "@/agent/state";

const RAW: RawSubmission = {
  submissionId: "test-submission",
  productSlug: "flashlearnai",
  formType: "contact-form",
  submittedAt: new Date().toISOString(),
  body: "How do I reset my review streak? I missed a couple of days.",
  contactEmail: "rosa.lim@example.com",
  priority: "normal",
};

const CLASSIFICATION: Classification = {
  category: "support_question",
  confidence: 0.92,
  rationale: "The sender is asking how to use a feature; nothing is broken.",
};

const ENRICHMENT: Enrichment = {
  pastSubmissions: [],
  productStatus: "green",
  customerTenure: "new",
};

function makeState(overrides: Partial<TriageState> = {}): TriageState {
  return {
    rawSubmission: RAW,
    classification: CLASSIFICATION,
    enrichment: ENRICHMENT,
    proposedAction: undefined,
    approval: undefined,
    execution: undefined,
    ...overrides,
  };
}

describe("propose node (no LLM path)", () => {
  it("returns no_action when there is no classification", async () => {
    const update = await propose(makeState({ classification: undefined }));
    expect(update.proposedAction?.type).toBe("no_action");
    expect(update.proposedAction?.reasoning.length).toBeGreaterThan(0);
  });
});

const hasApiKey = Boolean(
  process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY,
);

describe.skipIf(!hasApiKey)("propose node + draftReply (live LLM)", () => {
  it("proposes a structurally valid action for a support question", async () => {
    const update = await propose(makeState());
    const parsed = ProposedActionSchema.safeParse(update.proposedAction);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(ACTION_TYPES).toContain(parsed.data.type);
    expect(parsed.data.reasoning.trim().length).toBeGreaterThan(0);

    // A reply-type action must carry a drafted reply in its payload.
    if (
      parsed.data.type === "auto_reply" ||
      parsed.data.type === "draft_for_human"
    ) {
      expect(typeof parsed.data.payload.draft).toBe("string");
      expect((parsed.data.payload.draft as string).length).toBeGreaterThan(0);
    }
    console.log(
      `[propose] type=${parsed.data.type} — ${parsed.data.reasoning}`,
    );
  });

  it("draftReply returns a non-empty draft and a citations array", async () => {
    const result = await draftReply.invoke({
      submissionBody: RAW.body,
      productSlug: RAW.productSlug,
      category: "support_question",
      context: "Customer tenure: new. Product status: green.",
      tone: "friendly",
    });
    expect(typeof result.draft).toBe("string");
    expect(result.draft.trim().length).toBeGreaterThan(0);
    expect(Array.isArray(result.citations)).toBe(true);
  });
});

describe.skipIf(hasApiKey)("propose node (skipped)", () => {
  it("is skipped without an LLM API key", () => {
    expect(hasApiKey).toBe(false);
  });
});
