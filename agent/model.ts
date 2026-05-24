/**
 * Chat-model factory for the triage agent.
 *
 * The agent runs on **seven** providers — Anthropic / Google as paid options,
 * plus Ollama (local) and four hosted free tiers (Cerebras, OpenRouter,
 * Mistral, Together). The model id is picked **per graph node**. Which
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
 *   3. a default from whichever API key is present (paid first for backward
 *      compatibility; explicit env override is the way to default to a free
 *      provider).
 */
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOllama } from "@langchain/ollama";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { getEnv, requireEnv } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import {
  DEFAULT_MODELS,
  type TriageLlmProvider,
  type TriageNode,
} from "./model-config";

export {
  ANTHROPIC_MODEL,
  GOOGLE_MODEL,
  OLLAMA_MODEL,
  CEREBRAS_MODEL,
  OPENROUTER_MODEL,
  MISTRAL_MODEL,
  TOGETHER_MODEL,
  TRIAGE_NODES,
  TRIAGE_PROVIDERS,
  PROVIDER_LABELS,
  PROVIDER_COST_CLASS,
  DEFAULT_MODELS,
} from "./model-config";
export type {
  TriageLlmProvider,
  TriageNode,
  ProviderCostClass,
} from "./model-config";

/** OpenAI-compatible endpoints, per provider. */
const OPENAI_COMPATIBLE_BASE_URLS: Record<
  "cerebras" | "openrouter" | "together",
  string
> = {
  cerebras: "https://api.cerebras.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  together: "https://api.together.xyz/v1",
};

const VALID_PROVIDERS: readonly TriageLlmProvider[] = [
  "anthropic",
  "google",
  "ollama",
  "cerebras",
  "openrouter",
  "mistral",
  "together",
];

/**
 * Resolve the provider purely from the environment — the `TRIAGE_LLM_PROVIDER`
 * override, else whichever paid API key is present (backward compatible).
 * Callers that need the dashboard-stored provider go through `getSettings()`.
 */
export function resolveProvider(): TriageLlmProvider {
  const env = getEnv();

  const explicit = env.TRIAGE_LLM_PROVIDER;
  if (explicit && VALID_PROVIDERS.includes(explicit)) {
    return explicit;
  }
  if (explicit) {
    // Defensive: the Zod schema in env.ts should have caught this.
    throw new Error(
      `TRIAGE_LLM_PROVIDER must be one of ${VALID_PROVIDERS.join(", ")} ` +
        `(got "${explicit}").`,
    );
  }

  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.GEMINI_API_KEY) return "google";

  throw new Error(
    "No LLM provider configured. Set TRIAGE_LLM_PROVIDER (e.g. ollama, " +
      "cerebras, anthropic, google) or supply an ANTHROPIC_API_KEY / " +
      "GEMINI_API_KEY.",
  );
}

/**
 * Bounded retries. Two keeps worst-case latency sane; nodes are fail-soft, so
 * genuine exhaustion degrades gracefully rather than hanging the graph.
 */
const MAX_RETRIES = 2;

export interface BuildChatModelOptions {
  /** Which LLM-calling node this model is for — picks the per-node model id. */
  node: TriageNode;
  /**
   * Override the settings-stored provider for this call. Used by the fallback
   * chain to build models for specific providers regardless of what's stored.
   * When passed, the model id falls back to `DEFAULT_MODELS[provider][node]`
   * unless the stored settings happen to have a slot for that provider.
   */
  provider?: TriageLlmProvider;
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
  const settings = await getSettings();
  const provider = opts.provider ?? settings.provider;
  const model =
    settings.models[provider]?.[opts.node] ||
    DEFAULT_MODELS[provider][opts.node];
  const temperature = opts.temperature ?? settings.temperature;
  const maxTokens = opts.maxTokens ?? settings.maxTokens;
  const env = getEnv();

  switch (provider) {
    case "anthropic":
      return new ChatAnthropic({
        model,
        temperature,
        maxTokens,
        maxRetries: MAX_RETRIES,
        apiKey: requireEnv("ANTHROPIC_API_KEY"),
      });

    case "google":
      return new ChatGoogleGenerativeAI({
        model,
        temperature,
        maxOutputTokens: maxTokens,
        maxRetries: MAX_RETRIES,
        apiKey: requireEnv("GEMINI_API_KEY"),
      });

    case "ollama":
      return new ChatOllama({
        model,
        temperature,
        numPredict: maxTokens,
        baseUrl: env.OLLAMA_BASE_URL ?? "http://localhost:11434",
      });

    case "mistral":
      return new ChatMistralAI({
        model,
        temperature,
        maxTokens,
        maxRetries: MAX_RETRIES,
        apiKey: requireEnv("MISTRAL_API_KEY"),
      });

    case "cerebras":
    case "openrouter":
    case "together":
      return new ChatOpenAI({
        model,
        temperature,
        maxTokens,
        maxRetries: MAX_RETRIES,
        apiKey: requireEnv(
          provider === "cerebras"
            ? "CEREBRAS_API_KEY"
            : provider === "openrouter"
              ? "OPENROUTER_API_KEY"
              : "TOGETHER_API_KEY",
        ),
        configuration: { baseURL: OPENAI_COMPATIBLE_BASE_URLS[provider] },
      });

    default: {
      // Compile-fail if a new provider is added to the union without a case.
      const _exhaustive: never = provider;
      throw new Error(`Unhandled provider: ${String(_exhaustive)}`);
    }
  }
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
