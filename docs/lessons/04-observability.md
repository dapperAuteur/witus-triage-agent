# Lesson 4 — Observability: reading a trace

The first three lessons built an agent: a graph, a typed state, tools, and a
human-in-the-loop pause. This lesson is about the day after — when a run does something
you did not expect and you have to find out *why*. An LLM application that you cannot
observe is one you cannot debug, because the interesting failures happen inside model
calls you did not write and cannot step through.

## Tracing is mostly free, and must fail soft

The WitUS Triage Agent uses LangSmith for tracing. The notable thing about wiring it up
is how little wiring there is. LangChain's tracing activates from three environment
variables — `LANGSMITH_TRACING`, `LANGSMITH_API_KEY`, and `LANGSMITH_PROJECT` — which the
SDK reads on its own (LangChain, n.d.-a). There is no client to construct and no code in
the nodes that knows tracing exists.

That last point is a feature, not an accident. The project's rule is that tracing is *on
by default but never required* — the app must run with `LANGSMITH_API_KEY` unset. This is
why [`lib/env.ts`](../../lib/env.ts) marks every `LANGSMITH_*` variable optional, and why
[`lib/langsmith.ts`](../../lib/langsmith.ts) exposes `isTracingEnabled()` so the UI can
*hide* the "Open in LangSmith" link rather than render a broken one. Observability that
crashes the application when it is misconfigured is worse than no observability. Make it
fail soft.

```ts
export function isTracingEnabled(): boolean {
  const env = getEnv();
  return env.LANGSMITH_TRACING === "true" && Boolean(env.LANGSMITH_API_KEY);
}
```

## What a trace shows you

With tracing on, every graph run produces a tree. The root span is the run; under it sits
one span per node — `classify`, `enrich`, `propose`, `human_approval`, and whichever
terminal node ran. Under the LLM-calling nodes sit the actual model calls, and each model
call span carries the exact prompt sent, the raw response, the token counts, and the
latency.

This tree is the thing a stack trace cannot give you. A node is a pure function of state
(Lesson 2), so when a run goes wrong, the question is always "which node produced a bad
value, and what did it see when it did?" The trace answers both. You read top to bottom:
the state going *into* a node, the model call it made, the partial update it returned.
The bad value has a birthplace, and the trace names it.

## Finding a real bug from a real trace

Here is a concrete failure this project hit, and how a trace surfaced it.

Early in development, every classification came back as `category: "other"` with
`confidence: 0`. The runs did not error — they completed. The test suite even passed,
because the test only asserted that the category was *valid*, and `"other"` is valid.
Nothing was red. The agent was simply, quietly wrong.

The `classify` node is fail-soft by design (Lesson 2 named this exception): if the model
call throws, it catches the error and returns a fallback classification of `"other"` with
`confidence: 0`, so a single bad input cannot crash the graph. That safety net was now
catching *every* call — and because it caught the error, the error never reached the
logs.

The trace made it obvious in seconds. The `classify` node span was there; under it, the
model-call span was marked failed, and its error payload read, verbatim:
`"Your credit balance is too low to access the Anthropic API."` Not a code bug at all —
an unfunded API key. But notice what the trace did that the test suite could not: the
test said "a valid category was produced"; the trace said "the model call failed and the
fallback ran." The fail-soft path is *invisible to assertions on the output* and *visible
in a trace*. That is the whole argument for tracing in one example.

The fix had nothing to do with the graph. But finding it required seeing inside a model
call, and the only thing that sees inside a model call is a trace.

## Make every run findable

A trace is only useful if you can get to it from the run you are investigating. The
triage agent stores a `langsmithRunId` on every `triage_runs` row. It is generated in
[`lib/triage-runner.ts`](../../lib/triage-runner.ts) and passed into the graph as the
`runId` in the invocation config, so the id the database knows and the id LangSmith knows
are the same value. The run-detail page renders it next to an "Open in LangSmith" link.
The operator never has to guess which trace belongs to which run.

This is a small piece of plumbing with an outsized payoff. The expensive part of
debugging a production agent is usually not understanding the trace — it is *locating*
the trace for the run a human is complaining about. Storing the id at run time removes
that step entirely.

## A practical loop

Pulling the lesson together, here is the debugging loop for a misbehaving agent:

1. **Find the run.** Start from the `triage_runs` row — its `status`, its `langsmithRunId`,
   and its `triage_audit_log` entries. The audit log is the cheap, always-on record; the
   trace is the deep one.
2. **Open the trace.** Read the node spans top to bottom. Locate the first node whose
   output is wrong.
3. **Open that node's model call.** Read the prompt that was actually sent — not the
   prompt you think your code sends. Read the raw response.
4. **Decide where the bug lives.** A bad prompt is a code bug in the node. A good prompt
   with a bad response is a model or schema problem. A failed call hidden by a fail-soft
   fallback — like the credit-balance bug above — is an environment or quota problem.

Tracing does not make bugs rarer. It makes them *legible*: it converts "the agent is
acting weird" into "the `propose` node sent this exact prompt and got this exact reply."
That conversion is the entire job of observability, and for an application whose core
logic runs inside someone else's model, it is not optional.

This is the last lesson. You have a graph (Lesson 1), a state contract (Lesson 2), tools
and a durable human gate (Lesson 3), and now a way to see inside all of it. That is a
production agent — small enough to read in one sitting, real enough to run.

## References

Anthropic. (n.d.). *Errors and rate limits*. Anthropic. https://docs.anthropic.com/en/api/errors

LangChain. (n.d.-a). *Observability quick start*. LangSmith. https://docs.smith.langchain.com/

LangChain. (n.d.-b). *Trace with LangGraph*. LangSmith. https://docs.smith.langchain.com/observability/how_to_guides
