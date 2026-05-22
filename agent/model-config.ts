/**
 * Pure model configuration — provider/node types, the node list, the default
 * model matrix.
 *
 * This file has ZERO imports on purpose. `agent/model.ts` (the chat-model
 * factory) and `lib/settings.ts` both pull in `pg` and `server-only`
 * transitively; a `"use client"` component that needs only these constants
 * (e.g. the /admin settings form) imports from here instead, so the server
 * dependency chain never reaches a browser bundle.
 */

/** Claude Sonnet 4.6 — the default Anthropic model for every node. */
export const ANTHROPIC_MODEL = "claude-sonnet-4-6";
/** Gemini 2.5 Flash — the default Google model for every node. */
export const GOOGLE_MODEL = "gemini-2.5-flash";

export type TriageLlmProvider = "anthropic" | "google";

/** The graph nodes that make an LLM call (`draft_reply` is the draftReply tool). */
export type TriageNode = "classify" | "propose" | "draft_reply";

export const TRIAGE_NODES: readonly TriageNode[] = [
  "classify",
  "propose",
  "draft_reply",
];

/**
 * Built-in model matrix — the fallback when `app_settings` has no row (e.g.
 * before the migration) or a node's slot is left blank. The `/admin` dashboard
 * overrides these per provider and node.
 */
export const DEFAULT_MODELS: Record<
  TriageLlmProvider,
  Record<TriageNode, string>
> = {
  anthropic: {
    classify: ANTHROPIC_MODEL,
    propose: ANTHROPIC_MODEL,
    draft_reply: ANTHROPIC_MODEL,
  },
  google: {
    classify: GOOGLE_MODEL,
    propose: GOOGLE_MODEL,
    draft_reply: GOOGLE_MODEL,
  },
};
