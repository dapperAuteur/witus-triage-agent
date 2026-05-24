/**
 * Pure model configuration — provider/node types, the node list, the default
 * model matrix, cost-class metadata.
 *
 * This file has ZERO imports on purpose. `agent/model.ts` (the chat-model
 * factory) and `lib/settings.ts` both pull in `pg` and `server-only`
 * transitively; a `"use client"` component that needs only these constants
 * (e.g. the /admin settings form) imports from here instead, so the server
 * dependency chain never reaches a browser bundle.
 *
 * Provider cost classes:
 *   - "free"  — Ollama (local) or a hosted free tier (Cerebras, OpenRouter,
 *               Mistral, Together). Rate-limited, $0 in the normal case.
 *   - "paid"  — Anthropic / Google. Per-token billing. Available as emergency
 *               fallback or for quality-sensitive runs.
 */

/** Default Anthropic model — Claude Sonnet 4.6. */
export const ANTHROPIC_MODEL = "claude-sonnet-4-6";
/** Default Google model — Gemini 2.5 Flash (free tier). */
export const GOOGLE_MODEL = "gemini-2.5-flash";
/** Default Ollama model — small enough for a laptop. */
export const OLLAMA_MODEL = "llama3.1:8b";
/** Default Cerebras model — fast, free-tier daily quota. */
export const CEREBRAS_MODEL = "llama-3.3-70b";
/** Default OpenRouter model — the `:free` tier. */
export const OPENROUTER_MODEL = "deepseek/deepseek-chat:free";
/** Default Mistral model — free tier 1B tokens/month. */
export const MISTRAL_MODEL = "mistral-small-latest";
/** Default Together model — the free Turbo tier. */
export const TOGETHER_MODEL =
  "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free";

/**
 * Display order: free providers first, then paid. Also the single source of
 * truth for the `TriageLlmProvider` union — `as const` preserves the literal
 * tuple so `z.enum(TRIAGE_PROVIDERS)` picks up the exact union.
 */
export const TRIAGE_PROVIDERS = [
  "ollama",
  "cerebras",
  "openrouter",
  "mistral",
  "together",
  "anthropic",
  "google",
] as const;

export type TriageLlmProvider = (typeof TRIAGE_PROVIDERS)[number];

export type ProviderCostClass = "free" | "paid";

/** Cost-class per provider — drives the free-vs-paid UI in /admin. */
export const PROVIDER_COST_CLASS: Record<TriageLlmProvider, ProviderCostClass> =
  {
    ollama: "free",
    cerebras: "free",
    openrouter: "free",
    mistral: "free",
    together: "free",
    anthropic: "paid",
    google: "paid",
  };

/** Human-readable label per provider. */
export const PROVIDER_LABELS: Record<TriageLlmProvider, string> = {
  ollama: "Ollama (local)",
  cerebras: "Cerebras",
  openrouter: "OpenRouter",
  mistral: "Mistral",
  together: "Together AI",
  anthropic: "Anthropic Claude",
  google: "Google Gemini",
};

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
  ollama: {
    classify: OLLAMA_MODEL,
    propose: OLLAMA_MODEL,
    draft_reply: OLLAMA_MODEL,
  },
  cerebras: {
    classify: CEREBRAS_MODEL,
    propose: CEREBRAS_MODEL,
    draft_reply: CEREBRAS_MODEL,
  },
  openrouter: {
    classify: OPENROUTER_MODEL,
    propose: OPENROUTER_MODEL,
    draft_reply: OPENROUTER_MODEL,
  },
  mistral: {
    classify: MISTRAL_MODEL,
    propose: MISTRAL_MODEL,
    draft_reply: MISTRAL_MODEL,
  },
  together: {
    classify: TOGETHER_MODEL,
    propose: TOGETHER_MODEL,
    draft_reply: TOGETHER_MODEL,
  },
};
