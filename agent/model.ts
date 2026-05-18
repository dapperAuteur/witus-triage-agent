/**
 * Chat-model factory for the triage agent.
 *
 * The agent supports two LLM providers so testing can run on Gemini's free
 * tier while production uses Claude:
 *
 *   - `anthropic` — Claude Sonnet 4.6. The production / launch model (PRD §5).
 *   - `google`    — Gemini 2.5 Flash. The default for local + CI testing.
 *
 * Provider selection (highest precedence first):
 *   1. `TRIAGE_LLM_PROVIDER` env var, if set ("anthropic" | "google").
 *   2. `ANTHROPIC_API_KEY` present  -> anthropic.
 *   3. `GEMINI_API_KEY` present     -> google.
 *   4. otherwise -> throw a clear error.
 *
 * Both providers return a `BaseChatModel`, so `.withStructuredOutput()` works
 * identically downstream — nodes never branch on the provider.
 */
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { getEnv } from "@/lib/env";

/** Claude Sonnet 4.6 — the production model (PRD §5). */
export const ANTHROPIC_MODEL = "claude-sonnet-4-6";
/** Gemini 2.5 Flash — the testing model (free-tier friendly). */
export const GOOGLE_MODEL = "gemini-2.5-flash";

export type TriageLlmProvider = "anthropic" | "google";

export interface ChatModelOptions {
  /** Sampling temperature. Defaults to 0 — triage wants determinism. */
  temperature?: number;
  /** Max output tokens. */
  maxTokens?: number;
}

/** Resolve which provider to use from the environment. */
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
      "GEMINI_API_KEY (testing). See plans/user-tasks/01-provision-env-and-secrets.md.",
  );
}

/** The model id that will be used for the resolved provider. */
export function activeModelId(): string {
  return resolveProvider() === "anthropic" ? ANTHROPIC_MODEL : GOOGLE_MODEL;
}

/**
 * Bounded retries. The default (6) means a rate-limited call — common on the
 * Gemini free tier used for testing — can back off for over a minute before
 * failing. Capping at 2 keeps worst-case latency sane; nodes are fail-soft, so
 * genuine exhaustion degrades gracefully rather than hanging the graph.
 */
const MAX_RETRIES = 2;

export function getChatModel(opts: ChatModelOptions = {}): BaseChatModel {
  const env = getEnv();
  const temperature = opts.temperature ?? 0;
  const maxTokens = opts.maxTokens ?? 1024;

  if (resolveProvider() === "anthropic") {
    return new ChatAnthropic({
      model: ANTHROPIC_MODEL,
      temperature,
      maxTokens,
      maxRetries: MAX_RETRIES,
      apiKey: env.ANTHROPIC_API_KEY,
    });
  }

  return new ChatGoogleGenerativeAI({
    model: GOOGLE_MODEL,
    temperature,
    maxOutputTokens: maxTokens,
    maxRetries: MAX_RETRIES,
    apiKey: env.GEMINI_API_KEY,
  });
}
