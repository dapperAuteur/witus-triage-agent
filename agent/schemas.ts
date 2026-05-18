/**
 * Zod schemas for the triage agent's state payloads.
 *
 * This file imports ONLY `zod` — no LangGraph, no DB. That keeps it safe to
 * import from both `agent/state.ts` (which adds LangGraph) and `db/schema.ts`
 * (read by drizzle-kit, which must not pull heavy deps).
 *
 * The LLM structured-output schemas and the DB jsonb column types are both
 * derived from here, so a runtime schema and its compile-time type cannot
 * drift (STYLEGUIDE §3).
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Raw submission — adapted from the WitUS Inbox `submission` row.      */
/* The real message text lives inside the `payload` jsonb; the agent    */
/* derives a flat `body` string from it. `source` becomes `productSlug`.*/
/* ------------------------------------------------------------------ */

export const RawSubmissionSchema = z.object({
  /** WitUS Inbox `submission.id`. */
  submissionId: z.string(),
  /** Inbox `submission.source` — e.g. "witus-online", "flashlearnai". */
  productSlug: z.string(),
  /** Inbox `submission.form_type` — e.g. "contact-form", "bvc-feedback". */
  formType: z.string(),
  /** ISO timestamp — Inbox `submission.received_at`. */
  submittedAt: z.string(),
  /** Flattened human-readable text derived from `submission.payload`. */
  body: z.string(),
  contactEmail: z.string().optional(),
  contactName: z.string().optional(),
  priority: z.enum(["normal", "high"]),
});
export type RawSubmission = z.infer<typeof RawSubmissionSchema>;

/* ------------------------------------------------------------------ */
/* Classification — output of the `classify` node (LLM, structured).   */
/* ------------------------------------------------------------------ */

export const TRIAGE_CATEGORIES = [
  "support_question",
  "bug_report",
  "feature_request",
  "billing_issue",
  "abuse",
  "spam",
  "other",
] as const;

export const ClassificationSchema = z.object({
  category: z.enum(TRIAGE_CATEGORIES),
  /** Model's self-reported confidence, 0–1. */
  confidence: z.number().min(0).max(1),
  /** One or two sentences explaining the category choice. */
  rationale: z.string(),
});
export type Classification = z.infer<typeof ClassificationSchema>;

/* ------------------------------------------------------------------ */
/* Enrichment — output of the `enrich` node (deterministic, tools).    */
/* ------------------------------------------------------------------ */

export const EnrichmentSchema = z.object({
  pastSubmissions: z.array(
    z.object({
      id: z.string(),
      summary: z.string(),
      date: z.string(),
    }),
  ),
  productStatus: z.enum(["green", "yellow", "red"]),
  customerTenure: z.enum(["new", "returning", "longtime"]),
});
export type Enrichment = z.infer<typeof EnrichmentSchema>;

/* ------------------------------------------------------------------ */
/* Proposed action — output of the `propose` node (LLM, structured).   */
/* ------------------------------------------------------------------ */

export const ACTION_TYPES = [
  "auto_reply",
  "draft_for_human",
  "escalate_sms",
  "file_in_kb",
  "mark_spam",
  "no_action",
] as const;

export const ProposedActionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  /** Action-specific data — kept permissive; validated by each executor. */
  payload: z.record(z.string(), z.unknown()),
  reasoning: z.string(),
});
export type ProposedAction = z.infer<typeof ProposedActionSchema>;

/* ------------------------------------------------------------------ */
/* Approval — the operator's decision, supplied via the HITL resume.   */
/* ------------------------------------------------------------------ */

export const ApprovalSchema = z.object({
  decision: z.enum(["approved", "rejected", "edited"]),
  editedPayload: z.record(z.string(), z.unknown()).optional(),
  operatorNote: z.string().optional(),
  decidedAt: z.string(),
});
export type Approval = z.infer<typeof ApprovalSchema>;

/* ------------------------------------------------------------------ */
/* Execution — output of the `execute` / `log_rejection` nodes.        */
/* ------------------------------------------------------------------ */

export const ExecutionSchema = z.object({
  executedAt: z.string(),
  result: z.enum(["success", "failed"]),
  errorMessage: z.string().optional(),
});
export type Execution = z.infer<typeof ExecutionSchema>;
