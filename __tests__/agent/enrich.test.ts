/**
 * enrich node + tools — Day 2 test.
 *
 * `deriveTenure` is pure and always runs. The tool / node tests hit the local
 * Postgres, so they are skipped when STORAGE_DATABASE_URL is unset. They expect
 * the database to have been migrated and seeded (`npm run db:migrate && npm run
 * db:seed`) — the fixtures give every contact exactly one submission.
 */
import { describe, it, expect, afterAll } from "vitest";
import { deriveTenure } from "@/agent/nodes/enrich";
import { enrich } from "@/agent/nodes/enrich";
import { searchPastSubmissions } from "@/agent/tools/searchPastSubmissions";
import { getProductStatus } from "@/agent/tools/getProductStatus";
import { EnrichmentSchema, type RawSubmission } from "@/agent/schemas";
import type { TriageState } from "@/agent/state";

describe("deriveTenure", () => {
  it("maps past-submission count to a tenure band", () => {
    expect(deriveTenure(0)).toBe("new");
    expect(deriveTenure(1)).toBe("returning");
    expect(deriveTenure(2)).toBe("returning");
    expect(deriveTenure(3)).toBe("longtime");
    expect(deriveTenure(9)).toBe("longtime");
  });
});

const hasDb = Boolean(process.env.STORAGE_DATABASE_URL);

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

describe.skipIf(!hasDb)("enrich node + tools (live DB)", () => {
  afterAll(async () => {
    const { getPool } = await import("@/db/client");
    await getPool().end();
  });

  it("searchPastSubmissions finds a seeded contact's submission", async () => {
    const result = await searchPastSubmissions.invoke({
      contactEmail: "rosa.lim@example.com",
      limit: 5,
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const first = result[0];
    expect(typeof first.id).toBe("string");
    expect(first.summary.length).toBeGreaterThan(0);
    expect(() => new Date(first.date).toISOString()).not.toThrow();
  });

  it("searchPastSubmissions returns nothing for an unknown contact", async () => {
    const result = await searchPastSubmissions.invoke({
      contactEmail: "nobody-unknown@nowhere.example",
      limit: 5,
    });
    expect(result).toEqual([]);
  });

  it("getProductStatus returns a traffic-light status with a note", async () => {
    const status = await getProductStatus.invoke({
      productSlug: "flashlearnai",
    });
    expect(["green", "yellow", "red"]).toContain(status.status);
    expect(status.note.length).toBeGreaterThan(0);
  });

  it("enrich produces a valid Enrichment for a seeded submission", async () => {
    const update = await enrich(
      makeState({
        submissionId: "test-not-a-real-row",
        productSlug: "flashlearnai",
        formType: "contact-form",
        submittedAt: new Date().toISOString(),
        body: "Following up on my earlier streak question.",
        contactEmail: "rosa.lim@example.com",
        priority: "normal",
      }),
    );

    expect(update.enrichment).toBeDefined();
    const parsed = EnrichmentSchema.safeParse(update.enrichment);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.pastSubmissions.length).toBeGreaterThanOrEqual(1);
    expect(parsed.data.customerTenure).toBe("returning");
    console.log(
      `[enrich] flashlearnai -> status=${parsed.data.productStatus} ` +
        `tenure=${parsed.data.customerTenure} ` +
        `past=${parsed.data.pastSubmissions.length}`,
    );
  });
});

describe.skipIf(hasDb)("enrich node + tools (skipped)", () => {
  it("is skipped without STORAGE_DATABASE_URL", () => {
    console.warn("[enrich.test] STORAGE_DATABASE_URL not set — DB tests skipped.");
    expect(hasDb).toBe(false);
  });
});
