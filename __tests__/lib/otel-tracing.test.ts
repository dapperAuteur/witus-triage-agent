/**
 * lib/otel-tracing.ts — traceparent tolerance and run-span behavior.
 *
 * Registers a real in-memory tracer provider so the assertions run against
 * recorded spans, and the W3C propagator (the one @vercel/otel registers in
 * production) so the Inbox → agent trace continuation is verified for real,
 * not just "does not throw".
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { propagation, trace } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
  contextFromTraceparent,
  isValidTraceparent,
  markSpanError,
  withTriageSpan,
} from "@/lib/otel-tracing";

const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
const SPAN_ID = "b7ad6b7169203331";
const TRACEPARENT = `00-${TRACE_ID}-${SPAN_ID}-01`;

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
});

afterEach(() => exporter.reset());

afterAll(() => {
  trace.disable();
  propagation.disable();
});

describe("isValidTraceparent", () => {
  it("accepts a well-formed W3C traceparent", () => {
    expect(isValidTraceparent(TRACEPARENT)).toBe(true);
  });

  it.each([
    [undefined],
    [null],
    [""],
    ["not-a-traceparent"],
    [`01-${TRACE_ID}-${SPAN_ID}-01`], // unknown version
    [`00-${"0".repeat(32)}-${SPAN_ID}-01`], // all-zero trace id
    [`00-${TRACE_ID}-${"0".repeat(16)}-01`], // all-zero span id
    [`00-${TRACE_ID.slice(1)}-${SPAN_ID}-01`], // short trace id
  ])("rejects %s", (value) => {
    expect(isValidTraceparent(value)).toBe(false);
  });
});

describe("contextFromTraceparent", () => {
  it("restores the remote parent from a stored traceparent", () => {
    const ctx = contextFromTraceparent(TRACEPARENT);
    const spanContext = trace.getSpanContext(ctx);
    expect(spanContext?.traceId).toBe(TRACE_ID);
    expect(spanContext?.spanId).toBe(SPAN_ID);
  });

  it("falls back to the active context when the field is absent or malformed", () => {
    // The Inbox-side branch may not have merged yet — a missing value must
    // never throw and must not fabricate a remote parent.
    for (const value of [undefined, null, "garbage"]) {
      const ctx = contextFromTraceparent(value);
      expect(trace.getSpanContext(ctx)).toBeUndefined();
    }
  });
});

describe("withTriageSpan", () => {
  it("parents the run span on the stored traceparent and returns fn's result", async () => {
    const result = await withTriageSpan(
      "triage.run",
      { traceparent: TRACEPARENT, attributes: { "triage.source": "witus-online" } },
      async () => "ok",
    );
    expect(result).toBe("ok");

    const [span] = exporter.getFinishedSpans();
    expect(span.name).toBe("triage.run");
    expect(span.spanContext().traceId).toBe(TRACE_ID);
    expect(span.attributes["triage.source"]).toBe("witus-online");
  });

  it("starts a fresh trace when no traceparent is stored", async () => {
    await withTriageSpan("triage.run", {}, async () => undefined);
    const [span] = exporter.getFinishedSpans();
    expect(span.spanContext().traceId).not.toBe(TRACE_ID);
  });

  it("marks the span with the error NAME only and rethrows", async () => {
    class QuotaError extends Error {}
    const err = new QuotaError("secret submission text could echo here");
    await expect(
      withTriageSpan("triage.run", {}, async () => {
        throw err;
      }),
    ).rejects.toBe(err);

    const [span] = exporter.getFinishedSpans();
    expect(span.status.code).toBe(2); // SpanStatusCode.ERROR
    expect(span.status.message).toBe("QuotaError");
    expect(JSON.stringify({ attributes: span.attributes, status: span.status, events: span.events })).not.toContain("secret submission text");
  });

  it("markSpanError records the error class without ending the span", async () => {
    await withTriageSpan("triage.run", {}, async (span) => {
      markSpanError(span, new RangeError("body text must not leak"));
    });
    const [span] = exporter.getFinishedSpans();
    expect(span.status.message).toBe("RangeError");
    expect(span.attributes["error.type"]).toBe("RangeError");
    expect(JSON.stringify({ attributes: span.attributes, status: span.status, events: span.events })).not.toContain("body text must not leak");
  });
});
