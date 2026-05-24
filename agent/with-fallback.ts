/**
 * Build a chat model for a node, with a provider-fallback chain.
 *
 * When `TRIAGE_FALLBACK_PROVIDERS` is set (comma-separated provider names,
 * e.g. `openrouter,anthropic`), the primary model — chosen from the dashboard
 * settings — is wrapped with LangChain's built-in `withFallbacks([...])`.
 * If the primary throws (rate limit, 5xx, quota exhaustion), each fallback is
 * tried in order. Anthropic / Google appear here as the paid emergency tier
 * that catches a free-tier wall during a demo click.
 *
 * The accuracy eval intentionally calls `buildChatModel` directly (no
 * fallback) so a single run pins to one provider and the EVAL.md row records
 * exactly which model produced the score.
 */
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { getEnv } from "@/lib/env";
import {
  buildChatModel,
  type BuildChatModelOptions,
} from "./model";
import { type TriageLlmProvider } from "./model-config";

const VALID_PROVIDERS: ReadonlySet<TriageLlmProvider> = new Set([
  "anthropic",
  "google",
  "ollama",
  "cerebras",
  "openrouter",
  "mistral",
  "together",
]);

/**
 * Parse `TRIAGE_FALLBACK_PROVIDERS` into a list of provider names. Unknown
 * entries are dropped (with a console.warn) so a stale env value never
 * prevents the primary call from running.
 */
export function parseFallbackProviders(
  raw: string | undefined,
): TriageLlmProvider[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p): p is TriageLlmProvider => {
      if (!p) return false;
      if (!VALID_PROVIDERS.has(p as TriageLlmProvider)) {
        console.warn(
          `[triage] TRIAGE_FALLBACK_PROVIDERS: dropping unknown provider "${p}"`,
        );
        return false;
      }
      return true;
    });
}

/**
 * Build the model for `opts.node`, wrapped with a fallback chain when
 * `TRIAGE_FALLBACK_PROVIDERS` is set. The primary is whatever the dashboard /
 * env override picks; the chain is the env list in order. If no chain is
 * configured, this returns the bare primary unchanged.
 */
export async function buildChatModelWithFallback(
  opts: BuildChatModelOptions,
): Promise<BaseChatModel> {
  const primary = await buildChatModel(opts);
  const chain = parseFallbackProviders(getEnv().TRIAGE_FALLBACK_PROVIDERS);
  if (chain.length === 0) return primary;

  const fallbacks = await Promise.all(
    chain.map((provider) => buildChatModel({ ...opts, provider })),
  );
  return primary.withFallbacks(fallbacks) as unknown as BaseChatModel;
}
