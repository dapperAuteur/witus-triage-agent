/**
 * Chat-model factory for the triage agent.
 *
 * The agent runs on two providers — Anthropic Claude (production) and Google
 * Gemini (free-tier testing) — with the model chosen **per graph node**. Which
 * provider and which model each node uses is runtime configuration
 * (`lib/settings.ts`), editable from the `/admin` dashboard — no redeploy.
 *
 * The pure types + default matrix live in `./model-config` (no imports) so a
 * client component can use them without dragging this module's `pg` /
 * `server-only` dependency chain into the browser bundle.
 *
 * Provider resolution (highest precedence first):
 *   1. `TRIAGE_LLM_PROVIDER` env var — a hard override (the accuracy eval
 *      relies on being able to pin the provider this way).
 *   2. the stored `app_settings.provider`.
 *   3. a default from whichever API key is present.
 */
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { getEnv } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { DEFAULT_MODELS, type TriageLlmProvider, type TriageNode } from "./model-config";

export {
  ANTHROPIC_MODEL,
  GOOGLE_MODEL,
  TRIAGE_NODES,
  DEFAULT_MODELS,
} from "./model-config";
export type { TriageLlmProvider, TriageNode } from "./model-config";

/**
 * Resolve the provider purely from the environment — the `TRIAGE_LLM_PROVIDER`
 * override, else whichever API key is present. The dashboard-stored provider
 * is applied separately in `getSettings()`; this is the env-only view.
 */
export function resolveProvider(): TriageLlmProvider {
  const env = getEnv();

  const explicit = env.TRIAGE_LLM_PROVIDER?.toLowerCase();
  if (explicit === "anthropic" || explicit === "google") {
    return explicit;
  }
  if (explicit) {
    throw new Error(
      `TRIAGE_LLM_PROVIDER must be "anthropic" or "google" (got "${explicit}").`,
    );
  }

  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.GEMINI_API_KEY) return "google";

  throw new Error(
    "No LLM provider configured. Set ANTHROPIC_API_KEY (production) or " +
      "GEMINI_API_KEY (testing).",
  );
}

/**
 * Bounded retries. The default (6) means a rate-limited call — common on the
 * Gemini free tier used for testing — can back off for over a minute before
 * failing. Capping at 2 keeps worst-case latency sane; nodes are fail-soft, so
 * genuine exhaustion degrades gracefully rather than hanging the graph.
 */
const MAX_RETRIES = 2;

export interface BuildChatModelOptions {
  /** Which LLM-calling node this model is for — picks the per-node model id. */
  node: TriageNode;
  /** Overrides the settings-level temperature default for this call. */
  temperature?: number;
  /** Overrides the settings-level max-tokens default for this call. */
  maxTokens?: number;
}

/**
 * Build the chat model for a node using the active runtime settings (cached;
 * see `getSettings`). Async because the settings come from the database.
 */
export async function buildChatModel(
  opts: BuildChatModelOptions,
): Promise<BaseChatModel> {
  const env = getEnv();
  const settings = await getSettings();
  const provider = settings.provider;
  const model =
    settings.models[provider]?.[opts.node] ||
    DEFAULT_MODELS[provider][opts.node];
  const temperature = opts.temperature ?? settings.temperature;
  const maxTokens = opts.maxTokens ?? settings.maxTokens;

  if (provider === "anthropic") {
    return new ChatAnthropic({
      model,
      temperature,
      maxTokens,
      maxRetries: MAX_RETRIES,
      apiKey: env.ANTHROPIC_API_KEY,
    });
  }

  return new ChatGoogleGenerativeAI({
    model,
    temperature,
    maxOutputTokens: maxTokens,
    maxRetries: MAX_RETRIES,
    apiKey: env.GEMINI_API_KEY,
  });
}

/**
 * The model id the `classify` node will use under the current settings — used
 * by the accuracy eval to record the model in EVAL.md.
 */
export async function activeModelId(): Promise<string> {
  const settings = await getSettings();
  return (
    settings.models[settings.provider]?.classify ||
    DEFAULT_MODELS[settings.provider].classify
  );
}
