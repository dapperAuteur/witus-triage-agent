import { registerOTel, OTLPHttpProtoTraceExporter } from "@vercel/otel";
import type { Attributes, Context, SpanKind } from "@opentelemetry/api";
import { SamplingDecision, type Sampler, type SamplingResult } from "@opentelemetry/sdk-trace-base";

// OpenTelemetry → Honeycomb tracing. Loaded from instrumentation.ts's register() on both runtimes,
// BEFORE the Sentry configs, because whoever registers the global tracer provider first wins and
// this file must be the winner (see skipOpenTelemetrySetup in sentry.server.config.ts).
//
// GUARDED ON THE KEY: with neither Honeycomb var set, registration is skipped entirely and the app
// ships exactly as it does today. Same inert-until-provisioned pattern as the Sentry DSN and
// LangSmith. Provisioning: gemini/witus plans/user-tasks/73-observability-pilot-external-setup.md.
//
// WHICH VAR FEEDS THE HEADER: Honeycomb ingest auth expects the ingest key's SECRET in
// `x-honeycomb-team`. We read HONEYCOMB_INGEST_API_KEY_SECRET first and fall back to
// HONEYCOMB_API_KEY, then verify by behavior at first span send (witus plan 30 §7.1) rather than
// asserting which of BAM's two key values Honeycomb accepts.
//
// This mirrors gemini/witus/otel.config.ts — the pilot's reference wiring — with this repo's own
// service name. The LLM spans themselves come from lib/otel-llm-callback.ts, and the cross-service
// parent (WitUS Inbox → this agent) is restored in lib/triage-runner.ts via lib/otel-tracing.ts.

/**
 * Health-check probes of /api/health are pure noise in Honeycomb — the same span, thousands of
 * times a month — so they are dropped at the sampler, before they ever count against the free
 * tier's 20M events. Everything else records unsampled; the agreed lever if volume grows is ratio
 * sampling, not code changes (witus plan 30 §7.4).
 */
const dropHealthChecks: Sampler = {
  shouldSample(
    _context: Context,
    _traceId: string,
    _name: string,
    _kind: SpanKind,
    attributes: Attributes,
    // (trailing `links` param omitted — unused, and TS accepts implementations
    // with fewer params than the Sampler interface declares)
  ): SamplingResult {
    // Semconv moved http.target → url.path across OTel versions; accept either.
    const path = attributes["http.target"] ?? attributes["url.path"];
    if (typeof path === "string" && path.startsWith("/api/health")) {
      return { decision: SamplingDecision.NOT_RECORD };
    }
    return { decision: SamplingDecision.RECORD_AND_SAMPLED };
  },
  toString(): string {
    return "DropHealthChecksSampler";
  },
};

/** No-op without a key. One dataset per app: datasets fall out of `service.name` (plan 30 §7.1). */
export function registerHoneycombOtel(): void {
  const key = process.env.HONEYCOMB_INGEST_API_KEY_SECRET ?? process.env.HONEYCOMB_API_KEY;
  if (!key) return;

  registerOTel({
    serviceName: "witus-triage-agent",
    traceExporter: new OTLPHttpProtoTraceExporter({
      url: "https://api.honeycomb.io/v1/traces",
      headers: { "x-honeycomb-team": key },
    }),
    traceSampler: dropHealthChecks,
  });
}
