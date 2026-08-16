import {
  context as otelContext,
  propagation,
  trace,
  SpanStatusCode,
  type Attributes,
  type Context,
  type Span,
} from "@opentelemetry/api";

/**
 * OpenTelemetry helpers for the triage run — the app-level half of the Honeycomb
 * wiring (the SDK half is `otel.config.ts`).
 *
 * Everything here calls only the `@opentelemetry/api` surface, so with no
 * Honeycomb key set (no provider registered) every span is a no-op
 * NonRecordingSpan and every extract is a pass-through: zero behavior change,
 * same fail-soft posture as LangSmith and Sentry in this repo.
 *
 * PII rule (same posture as lib/sentry-scrub.ts): span attributes carry ids,
 * model names, categories, counts and statuses — NEVER submission bodies,
 * prompts, completions, or submitter emails/names.
 */

/** One shared tracer, named for the service (see otel.config.ts). */
export function getTriageTracer() {
  return trace.getTracer("witus-triage-agent");
}

/**
 * W3C traceparent: version "00", 32 hex trace-id, 16 hex span-id, 2 hex flags.
 * All-zero trace-id / span-id values are invalid per the spec.
 */
const TRACEPARENT_RE = /^00-(?!0{32})[0-9a-f]{32}-(?!0{16})[0-9a-f]{16}-[0-9a-f]{2}$/;

export function isValidTraceparent(value: unknown): value is string {
  return typeof value === "string" && TRACEPARENT_RE.test(value);
}

/**
 * Restore the cross-service parent for the async Inbox → agent hop
 * (witus plan 30 §7.2).
 *
 * WitUS Inbox stores a W3C `traceparent` with each submission and forwards it
 * on the webhook body; when present, the triage run's root span becomes a
 * child of that remote context, so one form submission reads as one waterfall
 * in Honeycomb across Inbox and agent. The field is optional BY DESIGN — the
 * Inbox-side branch may not have merged yet, and old submissions never carried
 * it — so a missing or malformed value simply falls back to the active local
 * context (the route handler's own span, or a fresh trace).
 */
export function contextFromTraceparent(traceparent: string | undefined | null): Context {
  if (!isValidTraceparent(traceparent)) return otelContext.active();
  return propagation.extract(otelContext.active(), { traceparent });
}

/**
 * The error's CLASS name — the only piece of an error that goes to Honeycomb,
 * because messages can echo input. Constructor name first: subclasses of
 * `Error` keep `name === "Error"` unless they set it explicitly, and the class
 * name (RateLimitError, TriageRunError, …) is the useful signal.
 */
export function errorTypeName(err: unknown): string {
  if (!(err instanceof Error)) return "Error";
  return err.constructor.name || err.name || "Error";
}

/**
 * Mark a span failed without ending it — for callers whose fail-soft `catch`
 * swallows the error instead of rethrowing (lib/triage-runner.ts). Error CLASS
 * only, per the PII rule above.
 */
export function markSpanError(span: Span, err: unknown): void {
  const errorType = errorTypeName(err);
  span.setAttribute("error.type", errorType);
  span.setStatus({ code: SpanStatusCode.ERROR, message: errorType });
}

export interface TriageSpanOptions {
  /** Stored W3C traceparent from the submission record, if any. */
  traceparent?: string;
  /** Initial attributes. Ids and enums only — no submission content. */
  attributes?: Attributes;
}

/**
 * Run `fn` inside a span, parented on the remote traceparent when one exists.
 *
 * The span is made active (context.with via startActiveSpan) so the LangChain
 * callback handler's LLM spans nest under it. Errors mark the span ERROR with
 * the error's NAME only — messages can quote input, and no submission content
 * goes to Honeycomb — then rethrow; the caller's own fail-soft handling stays
 * in charge.
 */
export async function withTriageSpan<T>(
  name: string,
  options: TriageSpanOptions,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const parentContext = contextFromTraceparent(options.traceparent);
  return getTriageTracer().startActiveSpan(
    name,
    { attributes: options.attributes },
    parentContext,
    async (span) => {
      try {
        return await fn(span);
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorTypeName(err) });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}
