/**
 * lib/otel-llm-callback.ts — one span per LLM attempt, PII rule enforced.
 *
 * The PII assertions are the load-bearing ones: prompts, completions and
 * submitter details must never appear anywhere on an exported span, same
 * posture as the Sentry scrub tests.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { Serialized } from "@langchain/core/load/serializable";
import type { LLMResult } from "@langchain/core/outputs";
import { extractTokenUsage, OtelLlmSpanHandler } from "@/lib/otel-llm-callback";

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
});

afterEach(() => exporter.reset());
afterAll(() => trace.disable());

const LLM = {
  lc: 1,
  type: "constructor",
  id: ["langchain", "chat_models", "ChatAnthropic"],
  kwargs: {},
} as unknown as Serialized;

const PROMPT = "PII: angry customer email body, jane@example.com";

function startedSpanHandler(): OtelLlmSpanHandler {
  return new OtelLlmSpanHandler();
}

describe("OtelLlmSpanHandler", () => {
  it("records model + provider + token usage, and never the prompt", () => {
    const handler = startedSpanHandler();
    handler.handleChatModelStart(
      LLM,
      [[{ content: PROMPT }]] as never,
      "run-1",
      undefined,
      { invocation_params: { model: "claude-sonnet-4-6" } },
      undefined,
      { ls_provider: "anthropic", ls_model_name: "claude-sonnet-4-6" },
    );
    handler.handleLLMEnd(
      {
        generations: [[{ text: "completion text with PII" }]],
        llmOutput: { tokenUsage: { promptTokens: 120, completionTokens: 30, totalTokens: 150 } },
      } as unknown as LLMResult,
      "run-1",
    );

    const [span] = exporter.getFinishedSpans();
    expect(span.name).toBe("triage.llm_call");
    expect(span.attributes["gen_ai.request.model"]).toBe("claude-sonnet-4-6");
    expect(span.attributes["gen_ai.system"]).toBe("anthropic");
    expect(span.attributes["gen_ai.usage.input_tokens"]).toBe(120);
    expect(span.attributes["gen_ai.usage.output_tokens"]).toBe(30);
    expect(span.attributes["gen_ai.usage.total_tokens"]).toBe(150);

    const serialized = JSON.stringify({ attributes: span.attributes, status: span.status, events: span.events });
    expect(serialized).not.toContain("angry customer");
    expect(serialized).not.toContain("jane@example.com");
    expect(serialized).not.toContain("completion text");
  });

  it("nests LLM spans under the given parent span", async () => {
    const tracer = trace.getTracer("test");
    const parent = tracer.startSpan("triage.run");
    const handler = new OtelLlmSpanHandler(parent);
    handler.handleLLMStart(LLM, [PROMPT], "run-2");
    handler.handleLLMEnd({ generations: [] } as unknown as LLMResult, "run-2");
    parent.end();

    const spans = exporter.getFinishedSpans();
    const llmSpan = spans.find((s) => s.name === "triage.llm_call");
    const runSpan = spans.find((s) => s.name === "triage.run");
    expect(llmSpan?.spanContext().traceId).toBe(runSpan?.spanContext().traceId);
  });

  it("marks a failed attempt with the error CLASS only (message may echo input)", () => {
    const handler = startedSpanHandler();
    handler.handleChatModelStart(LLM, [] as never, "run-3");
    class RateLimitError extends Error {}
    handler.handleLLMError(new RateLimitError(`400: invalid prompt: "${PROMPT}"`), "run-3");

    const [span] = exporter.getFinishedSpans();
    expect(span.status.code).toBe(2); // SpanStatusCode.ERROR
    expect(span.attributes["error.type"]).toBe("RateLimitError");
    expect(JSON.stringify({ attributes: span.attributes, status: span.status, events: span.events })).not.toContain("jane@example.com");
  });

  it("ignores end/error events for unknown run ids", () => {
    const handler = startedSpanHandler();
    expect(() => {
      handler.handleLLMEnd({ generations: [] } as unknown as LLMResult, "never-started");
      handler.handleLLMError(new Error("x"), "never-started");
    }).not.toThrow();
    expect(exporter.getFinishedSpans()).toHaveLength(0);
  });
});

describe("extractTokenUsage", () => {
  it("reads LangChain's normalized tokenUsage", () => {
    expect(
      extractTokenUsage({
        generations: [],
        llmOutput: { tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
      } as unknown as LLMResult),
    ).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  });

  it("reads raw Anthropic-style usage", () => {
    expect(
      extractTokenUsage({
        generations: [],
        llmOutput: { usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 } },
      } as unknown as LLMResult),
    ).toEqual({ inputTokens: 7, outputTokens: 3, totalTokens: 10 });
  });

  it("falls back to the generation's usage_metadata", () => {
    expect(
      extractTokenUsage({
        generations: [
          [{ message: { usage_metadata: { input_tokens: 4, output_tokens: 2, total_tokens: 6 } } }],
        ],
      } as unknown as LLMResult),
    ).toEqual({ inputTokens: 4, outputTokens: 2, totalTokens: 6 });
  });

  it("returns nothing when no shape matches", () => {
    expect(extractTokenUsage({ generations: [] } as unknown as LLMResult)).toEqual({});
  });
});
