/**
 * `enrich` node — the second node in the graph.
 *
 * Gathers context the operator (and the `propose` node) will want: the
 * contact's prior submissions, the product's current health, and how long the
 * contact has been around. No LLM call — it invokes two tools deterministically
 * and derives `customerTenure` from the result.
 *
 * Pure: it reads `state.rawSubmission` and returns only `{ enrichment }`.
 * The tool calls are reads, not mutations, so the node stays side-effect-free.
 *
 * Fail-soft: if the database is unreachable, enrichment degrades to an empty,
 * neutral result (best-effort context must never crash the graph).
 */
import { z } from "zod";
import { searchPastSubmissions } from "../tools/searchPastSubmissions";
import { getProductStatus } from "../tools/getProductStatus";
import {
  PastSubmissionSummarySchema,
  ProductStatusSchema,
  type CustomerTenure,
} from "../schemas";
import type { TriageState, TriageStateUpdate } from "../state";

const PastSubmissionsResultSchema = z.array(PastSubmissionSummarySchema);

/** Infer customer tenure from how many prior submissions the contact has. */
export function deriveTenure(pastSubmissionCount: number): CustomerTenure {
  if (pastSubmissionCount === 0) return "new";
  if (pastSubmissionCount <= 2) return "returning";
  return "longtime";
}

export async function enrich(state: TriageState): Promise<TriageStateUpdate> {
  const { rawSubmission } = state;

  try {
    // Tool 1 — prior submissions from the same contact (skip if no email).
    const pastSubmissions = rawSubmission.contactEmail
      ? PastSubmissionsResultSchema.parse(
          await searchPastSubmissions.invoke({
            contactEmail: rawSubmission.contactEmail,
            limit: 5,
            excludeSubmissionId: rawSubmission.submissionId,
          }),
        )
      : [];

    // Tool 2 — current product health.
    const productStatus = ProductStatusSchema.parse(
      await getProductStatus.invoke({
        productSlug: rawSubmission.productSlug,
      }),
    );

    return {
      enrichment: {
        pastSubmissions,
        productStatus: productStatus.status,
        customerTenure: deriveTenure(pastSubmissions.length),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`[enrich] degraded to neutral enrichment: ${message}`);
    return {
      enrichment: {
        pastSubmissions: [],
        productStatus: "green",
        customerTenure: "new",
      },
    };
  }
}
