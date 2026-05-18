/**
 * `getProductStatus` tool.
 *
 * Reports a traffic-light health signal for a WitUS product, so the agent can
 * weigh a submission against how the product is currently doing. The signal is
 * derived from how many submissions were classified as `bug_report` for that
 * product in the last 7 days:
 *
 *   red    — 3 or more recent bug reports
 *   yellow — 1 or 2
 *   green  — none
 *
 * Read-only — queries the local `triage_runs` + `submission` tables.
 */
import { tool } from "@langchain/core/tools";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { submissions, triageRuns } from "@/db/schema";
import type { ProductStatus } from "../schemas";

const RECENT_WINDOW_DAYS = 7;

export const GetProductStatusInputSchema = z.object({
  productSlug: z
    .string()
    .describe("The product slug, e.g. 'flashlearnai' or 'fly-witus'."),
});

export type GetProductStatusInput = z.infer<typeof GetProductStatusInputSchema>;

/**
 * The tool implementation, exported separately so it can be unit-tested and
 * called with a precise return type.
 */
export async function runGetProductStatus({
  productSlug,
}: GetProductStatusInput): Promise<ProductStatus> {
  const db = getDb();
  const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({ bugCount: count() })
    .from(triageRuns)
    .innerJoin(submissions, eq(triageRuns.submissionId, submissions.id))
    .where(
      and(
        eq(submissions.source, productSlug),
        gte(triageRuns.createdAt, since),
        sql`${triageRuns.classification} ->> 'category' = 'bug_report'`,
      ),
    );

  const bugCount = rows[0]?.bugCount ?? 0;

  if (bugCount >= 3) {
    return {
      status: "red",
      note: `${bugCount} bug reports triaged for ${productSlug} in the last ${RECENT_WINDOW_DAYS} days.`,
    };
  }
  if (bugCount >= 1) {
    return {
      status: "yellow",
      note: `${bugCount} bug report(s) triaged for ${productSlug} in the last ${RECENT_WINDOW_DAYS} days.`,
    };
  }
  return {
    status: "green",
    note: `No bug reports triaged for ${productSlug} in the last ${RECENT_WINDOW_DAYS} days.`,
  };
}

export const getProductStatus = tool(runGetProductStatus, {
  name: "get_product_status",
  description:
    "Get the current health (green / yellow / red) of a WitUS product, based " +
    "on the volume of recently triaged bug reports. Returns { status, note }.",
  schema: GetProductStatusInputSchema,
});
