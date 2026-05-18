/**
 * `searchPastSubmissions` tool.
 *
 * Looks up prior WitUS Inbox submissions from the same contact email so the
 * agent can see whether this is a first-time sender or a returning one, and
 * what they wrote before. Read-only — queries the local `submission` table.
 */
import { tool } from "@langchain/core/tools";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { submissions } from "@/db/schema";
import type { PastSubmissionSummary } from "../schemas";

export const SearchPastSubmissionsInputSchema = z.object({
  contactEmail: z
    .string()
    .describe("The contact's email address to find prior submissions for."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe("Maximum number of prior submissions to return."),
  excludeSubmissionId: z
    .string()
    .optional()
    .describe("The current submission's id, excluded from the results."),
});

export type SearchPastSubmissionsInput = z.infer<
  typeof SearchPastSubmissionsInputSchema
>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Build a short, human-readable summary from a submission's jsonb payload. */
function summarizePayload(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const subject = record.subject;
    if (typeof subject === "string" && subject.trim().length > 0) {
      return subject.trim().slice(0, 140);
    }
    const message = record.message;
    if (typeof message === "string" && message.trim().length > 0) {
      const flat = message.trim().replace(/\s+/g, " ");
      return flat.length > 140 ? `${flat.slice(0, 137)}...` : flat;
    }
  }
  return "(no readable content)";
}

/**
 * The tool implementation, exported separately so it can be unit-tested and
 * called with a precise return type.
 */
export async function runSearchPastSubmissions({
  contactEmail,
  limit,
  excludeSubmissionId,
}: SearchPastSubmissionsInput): Promise<PastSubmissionSummary[]> {
  const db = getDb();
  // Only apply the exclusion when the id is a real uuid — `submission.id` is a
  // uuid column, and comparing it to a non-uuid string errors in Postgres.
  // A non-uuid id can't match any real row anyway, so skipping it is correct.
  const exclude =
    excludeSubmissionId && UUID_RE.test(excludeSubmissionId)
      ? ne(submissions.id, excludeSubmissionId)
      : undefined;
  const rows = await db
    .select({
      id: submissions.id,
      payload: submissions.payload,
      receivedAt: submissions.receivedAt,
    })
    .from(submissions)
    .where(and(eq(submissions.submitterEmail, contactEmail), exclude))
    .orderBy(desc(submissions.receivedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    summary: summarizePayload(row.payload),
    date: row.receivedAt.toISOString(),
  }));
}

export const searchPastSubmissions = tool(runSearchPastSubmissions, {
  name: "search_past_submissions",
  description:
    "Find prior WitUS Inbox submissions from the same contact email. Returns " +
    "a list of { id, summary, date }, newest first. Use it to judge whether " +
    "a sender is new or returning and to see their history.",
  schema: SearchPastSubmissionsInputSchema,
});
