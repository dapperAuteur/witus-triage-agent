import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";
import type { LLMResult } from "@langchain/core/outputs";
import {
  context as otelContext,
  trace as otelTrace,
  SpanStatusCode,
  type Span,
} from "@opentelemetry/api";
import { errorTypeName, getTriageTracer } from "@/lib/otel-tracing";

/**
 * LangChain callback handler that turns every LLM call inside a triage run
 * into an OpenTelemetry span — one span per provider attempt, so a fallback
 * chain (agent/with-fallback.ts) shows up as a failed primary span followed by
 * a successful fallback span, which is exactly the shape the "triage-agent LLM
 * error rate" Honeycomb trigger wants (witus plan 30 §6).
 *
 * Passed once per run in the graph `invoke()` config (lib/triage-runner.ts);
 * @langchain/core propagates config callbacks to the nested `model.invoke()`
 * calls inside graph nodes via AsyncLocalStorage, so the nodes themselves stay
 * pure and untouched (STYLEGUIDE §3).
 *
 * PII RULE (absolute — same posture as lib/sentry-scrub.ts): attributes carry
 * the model name, provider, token counts and error CLASS only. Never prompts,
 * completions, submission content, submitter names/emails, or provider error
 * MESSAGES (which can echo input).
 *
 * Fail-soft: with no Honeycomb key registered, every span here is a no-op
 * NonRecordingSpan; the handler itself never throws into the run.
 */

interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

function asCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Token usage lands in different places per provider wrapper: LangChain's
 * normalized `llmOutput.tokenUsage` (promptTokens/completionTokens), raw
 * Anthropic-style `llmOutput.usage` (input_tokens/output_tokens), or the
 * standardized `usage_metadata` on the AIMessage generation. Check all three;
 * absent counts are simply not recorded.
 */
export function extractTokenUsage(output: LLMResult): TokenUsage {
  const llmOutput = (output.llmOutput ?? {}) as Record<string, unknown>;

  const tokenUsage = llmOutput.tokenUsage as Record<string, unknown> | undefined;
  if (tokenUsage) {
    const usage: TokenUsage = {
      inputTokens: asCount(tokenUsage.promptTokens),
      outputTokens: asCount(tokenUsage.completionTokens),
      totalTokens: asCount(tokenUsage.totalTokens),
    };
    if (usage.inputTokens !== undefined || usage.outputTokens !== undefined) return usage;
  }

  const rawUsage = llmOutput.usage as Record<string, unknown> | undefined;
  if (rawUsage) {
    const usage: TokenUsage = {
      inputTokens: asCount(rawUsage.input_tokens),
      outputTokens: asCount(rawUsage.output_tokens),
      totalTokens: asCount(rawUsage.total_tokens),
    };
    if (usage.inputTokens !== undefined || usage.outputTokens !== undefined) return usage;
  }

  const generation = output.generations?.[0]?.[0] as
    | { message?: { usage_metadata?: Record<string, unknown> } }
    | undefined;
  const meta = generation?.message?.usage_metadata;
  if (meta) {
    return {
      inputTokens: asCount(meta.input_tokens),
      outputTokens: asCount(meta.output_tokens),
      totalTokens: asCount(meta.total_tokens),
    };
  }
  return {};
}

export class OtelLlmSpanHandler extends BaseCallbackHandler {
  name = "otel-llm-span-handler";

  /** Open spans keyed by LangChain run id. */
  private readonly spans = new Map<string, Span>();

  /**
   * @param parentSpan the span the LLM spans nest under — normally the
   * `triage.run` root span. Explicit rather than relying on the active
   * context, so nesting survives even where AsyncLocalStorage does not flow
   * through LangChain's callback internals.
   */
  constructor(private readonly parentSpan?: Span) {
    super();
  }

  private startSpan(
    llm: Serialized,
    runId: string,
    extraParams?: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): void {
    try {
      const invocationParams = (extraParams?.invocation_params ?? {}) as Record<string, unknown>;
      const model =
        (typeof metadata?.ls_model_name === "string" && metadata.ls_model_name) ||
        (typeof invocationParams.model === "string" && invocationParams.model) ||
        (typeof invocationParams.model_name === "string" && invocationParams.model_name) ||
        llm.id[llm.id.length - 1] ||
        "unknown";
      const provider =
        typeof metadata?.ls_provider === "string" ? metadata.ls_provider : undefined;

      const parentContext = this.parentSpan
        ? otelTrace.setSpan(otelContext.active(), this.parentSpan)
        : otelContext.active();
      const span = getTriageTracer().startSpan(
        "triage.llm_call",
        {
          attributes: {
            "gen_ai.request.model": model,
            ...(provider ? { "gen_ai.system": provider } : {}),
          },
        },
        parentContext,
      );
      this.spans.set(runId, span);
    } catch {
      // Tracing must never break a triage run.
    }
  }

  handleChatModelStart(
    llm: Serialized,
    _messages: unknown,
    runId: string,
    _parentRunId?: string,
    extraParams?: Record<string, unknown>,
    _tags?: string[],
    metadata?: Record<string, unknown>,
  ): void {
    this.startSpan(llm, runId, extraParams, metadata);
  }

  handleLLMStart(
    llm: Serialized,
    _prompts: string[],
    runId: string,
    _parentRunId?: string,
    extraParams?: Record<string, unknown>,
    _tags?: string[],
    metadata?: Record<string, unknown>,
  ): void {
    this.startSpan(llm, runId, extraParams, metadata);
  }

  handleLLMEnd(output: LLMResult, runId: string): void {
    const span = this.spans.get(runId);
    if (!span) return;
    this.spans.delete(runId);
    try {
      const usage = extractTokenUsage(output);
      if (usage.inputTokens !== undefined)
        span.setAttribute("gen_ai.usage.input_tokens", usage.inputTokens);
      if (usage.outputTokens !== undefined)
        span.setAttribute("gen_ai.usage.output_tokens", usage.outputTokens);
      if (usage.totalTokens !== undefined)
        span.setAttribute("gen_ai.usage.total_tokens", usage.totalTokens);
      span.setStatus({ code: SpanStatusCode.OK });
    } finally {
      span.end();
    }
  }

  handleLLMError(err: unknown, runId: string): void {
    const span = this.spans.get(runId);
    if (!span) return;
    this.spans.delete(runId);
    try {
      // Error CLASS only — provider error messages can echo prompt/input text.
      const errorType = errorTypeName(err);
      span.setAttribute("error.type", errorType);
      span.setStatus({ code: SpanStatusCode.ERROR, message: errorType });
    } finally {
      span.end();
    }
  }
}
