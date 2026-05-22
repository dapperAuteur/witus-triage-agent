/**
 * classify — fail-soft path guard.
 *
 * The accuracy eval's "abort loudly, never fake a number" guarantee
 * (__tests__/agent/accuracy.test.ts) depends on `classify`'s catch block
 * writing a rationale that starts with `CLASSIFY_FAILSOFT_PREFIX`. This test
 * forces that path — by mocking `buildChatModel` to throw — and asserts the
 * contract holds. If a refactor breaks it, this fails *here*, instead of the
 * eval silently reverting to scoring infrastructure failures as real numbers.
 *
 * It lives in its own file: the `vi.mock` below is module-level, so mixing it
 * into classify.test.ts would neuter that file's live LLM tests. No API key or
 * database needed — it runs in every `npm test`.
 */
import { describe, it, expect, vi } from "vitest";
import { classify, CLASSIFY_FAILSOFT_PREFIX } from "@/agent/nodes/classify";
import type { RawSubmission } from "@/agent/schemas";
import type { TriageState } from "@/agent/state";

// Force the classify node down its catch path: the LLM build always rejects.
vi.mock("@/agent/model", () => ({
  buildChatModel: vi.fn(() => Promise.reject(new Error("forced LLM failure"))),
}));

function makeState(): TriageState {
  const rawSubmission: RawSubmission = {
    submissionId: "failsoft-test",
    productSlug: "flashlearnai",
    formType: "contact-form",
    submittedAt: new Date().toISOString(),
    body: "How do I reset my review streak?",
    priority: "normal",
  };
  return {
    rawSubmission,
    classification: undefined,
    enrichment: undefined,
    proposedAction: undefined,
    approval: undefined,
    execution: undefined,
  };
}

describe("classify — fail-soft path", () => {
  it("falls back to an 'other' / confidence-0 result when the LLM call throws", async () => {
    const update = await classify(makeState());

    expect(update.classification).toBeDefined();
    expect(update.classification?.category).toBe("other");
    expect(update.classification?.confidence).toBe(0);
  });

  it("writes a rationale starting with CLASSIFY_FAILSOFT_PREFIX", async () => {
    const update = await classify(makeState());

    // This is the exact contract the accuracy eval matches on to tell an
    // infrastructure failure apart from a real misclassification.
    expect(
      update.classification?.rationale.startsWith(CLASSIFY_FAILSOFT_PREFIX),
    ).toBe(true);
  });
});
