/**
 * Tests for the 7-provider chat-model factory and the fallback parser.
 *
 * `getSettings` is mocked so tests don't touch the real database; the dispatch
 * being verified is `buildChatModel`'s switch and `parseFallbackProviders`'s
 * normalisation. Each provider sets its API key in process.env so that
 * `requireEnv` does not throw on construction.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MODELS,
  TRIAGE_PROVIDERS,
  type TriageLlmProvider,
} from "@/agent/model-config";

const baseEnv = { ...process.env };

beforeEach(() => {
  // Reset module caches so getEnv() re-parses with the per-test env.
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...baseEnv };
  vi.restoreAllMocks();
});

/** Build a stub TriageSettings object with `DEFAULT_MODELS` for every provider. */
function stubSettings(provider: TriageLlmProvider) {
  const models = {} as Record<
    TriageLlmProvider,
    { classify: string; propose: string; draft_reply: string }
  >;
  for (const p of TRIAGE_PROVIDERS) {
    models[p] = { ...DEFAULT_MODELS[p] };
  }
  return {
    provider,
    models,
    temperature: 0,
    maxTokens: 1024,
    tracingEnabled: false,
  };
}

async function mockedFactory(provider: TriageLlmProvider) {
  vi.doMock("@/lib/settings", () => ({
    getSettings: vi.fn(async () => stubSettings(provider)),
    providerOverride: vi.fn(() => null),
    getStoredSettings: vi.fn(async () => stubSettings(provider)),
    updateSettings: vi.fn(),
    invalidateSettingsCache: vi.fn(),
  }));
  return await import("@/agent/model");
}

describe("buildChatModel — provider dispatch", () => {
  it("builds ChatAnthropic for anthropic", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    const { buildChatModel } = await mockedFactory("anthropic");
    const model = await buildChatModel({ node: "classify" });
    expect(model.constructor.name).toBe("ChatAnthropic");
  });

  it("builds ChatGoogleGenerativeAI for google", async () => {
    process.env.GEMINI_API_KEY = "test-gemini";
    const { buildChatModel } = await mockedFactory("google");
    const model = await buildChatModel({ node: "classify" });
    expect(model.constructor.name).toBe("ChatGoogleGenerativeAI");
  });

  it("builds ChatOllama for ollama (no API key required)", async () => {
    const { buildChatModel } = await mockedFactory("ollama");
    const model = await buildChatModel({ node: "classify" });
    expect(model.constructor.name).toBe("ChatOllama");
  });

  it("builds ChatMistralAI for mistral", async () => {
    process.env.MISTRAL_API_KEY = "test-mistral";
    const { buildChatModel } = await mockedFactory("mistral");
    const model = await buildChatModel({ node: "classify" });
    expect(model.constructor.name).toBe("ChatMistralAI");
  });

  it("builds ChatOpenAI for cerebras", async () => {
    process.env.CEREBRAS_API_KEY = "test-cerebras";
    const { buildChatModel } = await mockedFactory("cerebras");
    const model = await buildChatModel({ node: "classify" });
    expect(model.constructor.name).toBe("ChatOpenAI");
  });

  it("builds ChatOpenAI for openrouter", async () => {
    process.env.OPENROUTER_API_KEY = "test-openrouter";
    const { buildChatModel } = await mockedFactory("openrouter");
    const model = await buildChatModel({ node: "classify" });
    expect(model.constructor.name).toBe("ChatOpenAI");
  });

  it("builds ChatOpenAI for together", async () => {
    process.env.TOGETHER_API_KEY = "test-together";
    const { buildChatModel } = await mockedFactory("together");
    const model = await buildChatModel({ node: "classify" });
    expect(model.constructor.name).toBe("ChatOpenAI");
  });

  it("throws when the required API key is missing for a hosted provider", async () => {
    delete process.env.CEREBRAS_API_KEY;
    const { buildChatModel } = await mockedFactory("cerebras");
    await expect(buildChatModel({ node: "classify" })).rejects.toThrow(
      /CEREBRAS_API_KEY/,
    );
  });

  it("honours the per-call provider override", async () => {
    // Settings say anthropic, opts say cerebras — opts wins.
    process.env.CEREBRAS_API_KEY = "test-cerebras";
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    const { buildChatModel } = await mockedFactory("anthropic");
    const model = await buildChatModel({
      node: "classify",
      provider: "cerebras",
    });
    expect(model.constructor.name).toBe("ChatOpenAI");
  });
});

describe("parseFallbackProviders", () => {
  it("returns [] for undefined / empty", async () => {
    const { parseFallbackProviders } = await import("@/agent/with-fallback");
    expect(parseFallbackProviders(undefined)).toEqual([]);
    expect(parseFallbackProviders("")).toEqual([]);
  });

  it("parses a comma-separated list", async () => {
    const { parseFallbackProviders } = await import("@/agent/with-fallback");
    expect(parseFallbackProviders("openrouter,anthropic")).toEqual([
      "openrouter",
      "anthropic",
    ]);
  });

  it("trims whitespace and lowercases", async () => {
    const { parseFallbackProviders } = await import("@/agent/with-fallback");
    expect(parseFallbackProviders(" Cerebras , OpenRouter ")).toEqual([
      "cerebras",
      "openrouter",
    ]);
  });

  it("drops unknown providers and keeps the valid ones", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { parseFallbackProviders } = await import("@/agent/with-fallback");
    expect(parseFallbackProviders("openrouter,bogus,anthropic")).toEqual([
      "openrouter",
      "anthropic",
    ]);
    expect(warn).toHaveBeenCalled();
  });
});
