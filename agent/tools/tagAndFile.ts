/**
 * `tagAndFile` tool.
 *
 * Files a submission away: records triage tags + a folder on the submission's
 * payload and closes it. Used by the `execute` node for approved `file_in_kb`
 * and `mark_spam` actions.
 *
 * This tool mutates the `submission` row — it must only run from the `execute`
 * node, after operator approval.
 */
import { tool } from "@langchain/core/tools";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { submissions } from "@/db/schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TagAndFileInputSchema = z.object({
  submissionId: z.string().describe("The submission to tag and file."),
  tags: z.array(z.string()).describe("Triage tags to record on the submission."),
  folder: z
    .string()
    .describe("The folder / category the submission is filed under."),
});

export type TagAndFileInput = z.infer<typeof TagAndFileInputSchema>;

export interface TagAndFileResult {
  success: boolean;
}

/** The tool implementation, exported separately for typed direct calls + tests. */
export async function runTagAndFile({
  submissionId,
  tags,
  folder,
}: TagAndFileInput): Promise<TagAndFileResult> {
  // `submission.id` is a uuid column — a non-uuid id would error in Postgres
  // and can't match a row anyway.
  if (!UUID_RE.test(submissionId)) {
    return { success: false };
  }

  const db = getDb();
  const triagePatch = JSON.stringify({
    _triage: { tags, folder, filedAt: new Date().toISOString() },
  });

  const updated = await db
    .update(submissions)
    .set({
      status: "closed",
      // jsonb `||` merges the patch into the existing payload.
      payload: sql`${submissions.payload} || ${triagePatch}::jsonb`,
    })
    .where(eq(submissions.id, submissionId))
    .returning({ id: submissions.id });

  return { success: updated.length > 0 };
}

export const tagAndFile = tool(runTagAndFile, {
  name: "tag_and_file",
  description:
    "File a submission: record triage tags + a folder on it and close it. " +
    "Returns { success }. Side-effecting — execute-node use only.",
  schema: TagAndFileInputSchema,
});
