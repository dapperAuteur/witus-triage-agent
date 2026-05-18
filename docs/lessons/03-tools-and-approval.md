# Lesson 3 — Tools and the human-in-the-loop interrupt

This lesson covers the two ideas that make the WitUS Triage Agent more than a sequence of
prompts: **tools** give the agent typed, deterministic access to the outside world, and
the **human-in-the-loop interrupt** lets the graph stop and wait for a person before
acting. Both lean on the state and schema discipline from Lesson 2.

## Tools are functions with a schema

A tool, in LangGraph terms, is a function plus a description plus an input schema. The
schema is not optional polish — it is the contract between the caller and the tool, the
same way `TriageState` is the contract between nodes.

Here is `searchPastSubmissions`, abridged from
[`agent/tools/searchPastSubmissions.ts`](../../agent/tools/searchPastSubmissions.ts):

```ts
export const SearchPastSubmissionsInputSchema = z.object({
  contactEmail: z.string().describe("The contact's email address."),
  limit: z.number().int().min(1).max(20).default(5),
  excludeSubmissionId: z.string().optional(),
});

export const searchPastSubmissions = tool(runSearchPastSubmissions, {
  name: "search_past_submissions",
  description: "Find prior WitUS Inbox submissions from the same contact email.",
  schema: SearchPastSubmissionsInputSchema,
});
```

The `tool()` wrapper takes the implementation and the metadata. The Zod schema does three
jobs at once: it documents the inputs, it validates them at the boundary, and — if the
tool is ever bound to a model for the model to call — it becomes the JSON schema the
model sees (LangChain, n.d.-a).

A subtle but important choice in this project: the `enrich` node calls its tools
**deterministically**, not by letting a model decide. `enrich` knows it always wants the
contact's history and the product's status, so it just calls `searchPastSubmissions` and
`getProductStatus` directly. Tools are often associated with "agentic" model-driven tool
selection, but a tool is valuable on its own merits — a typed, validated, named unit of
work — even when ordinary code decides to call it. Use model-driven tool calling when the
*choice* of tool is genuinely uncertain; use a deterministic call when it is not. The
triage agent does both: `enrich` calls tools deterministically, while `propose` makes one
model decision and then deterministically assembles the rest.

## The problem the interrupt solves

The `human_approval` node has to do something no ordinary function can: stop, let a human
think for an unknown length of time, and continue. The human might approve in ten seconds
or ten hours. The server process might restart in between. The approval arrives on a
completely separate HTTP request from the one that started the run.

A plain `await` cannot express this. You cannot hold an HTTP request open for ten hours,
and you certainly cannot hold it open across a deploy.

## `interrupt()` and the checkpointer

LangGraph's answer has two parts that must be used together (LangChain, n.d.-b).

The `interrupt()` function, called inside a node, suspends the graph and surfaces a
payload to the caller. Here is the entire `human_approval` node
([`agent/nodes/humanApproval.ts`](../../agent/nodes/humanApproval.ts)):

```ts
export function humanApproval(state: TriageState): TriageStateUpdate {
  const resumeValue = interrupt({
    kind: "approval_request",
    classification: state.classification,
    enrichment: state.enrichment,
    proposedAction: state.proposedAction,
  });

  const decision = ApprovalDecisionInputSchema.parse(resumeValue);
  return { approval: { ...decision, decidedAt: new Date().toISOString() } };
}
```

On the first run, `interrupt()` does not return — it throws a special signal that pauses
the graph. So how does the paused graph survive a process restart? That is the second
part: the **checkpointer**. The graph is compiled with a `PostgresSaver`
([`agent/checkpointer.ts`](../../agent/checkpointer.ts)), and at every step — including
the moment it pauses — the checkpointer writes the full graph state to Postgres, keyed by
a `thread_id`.

This project uses the triage run's database id as the `thread_id`. One run is one
durable thread. That single decision is what makes resuming trivial: the approval request
arrives at `POST /api/triage/runs/:id/approve`, and the `:id` in the URL *is* the
`thread_id`. The route needs nothing else to find the exact paused graph.

## Resuming with `Command`

To resume, you invoke the graph again — same `thread_id` — but instead of fresh input you
pass a `Command` carrying the resume value:

```ts
await graph.invoke(
  new Command({ resume: { decision: "approved" } }),
  { configurable: { thread_id: runId } },
);
```

Now the magic: LangGraph loads the checkpoint, re-enters `human_approval`, and *this
time* `interrupt()` returns — it returns exactly the object inside `Command({ resume })`.
The node finishes, the conditional edge routes to `execute` or `log_rejection`, and the
graph runs to the end.

## The gotcha: the node re-runs

Read the previous paragraph carefully. On resume, LangGraph re-enters `human_approval`
and runs it *from its first line*. The node executes twice across the run's lifetime —
once up to the `interrupt()` (which pauses it), and once more on resume (which completes
it).

This is why Lesson 2 insisted nodes be pure, and why `human_approval` is only two
statements long. If that node did a database write or sent a notification *before* the
`interrupt()` call, that side effect would fire twice. The rule that falls out of this:
**a node containing `interrupt()` must do nothing but call `interrupt()` and shape the
result.** All real work happens in the nodes after the interrupt — `execute` and
`log_rejection` — which run exactly once.

## The gate, stated precisely

Put together, the interrupt gives a guarantee you can describe in one sentence: *the
`execute` node is unreachable except through an `human_approval` node that has recorded an
`approved` or `edited` decision.* Rejection routes to `log_rejection`, which performs no
external action. There is no edge into `execute` that bypasses the human. The
[`graph.test.ts`](../../__tests__/agent/graph.test.ts) suite asserts exactly this: after
the first `invoke()` the run is paused with no `execution`; only after a resume does
`execution` appear. The approval gate is not a convention or a code review rule — it is
the topology of the graph.

Lesson 4 turns to the question every one of these lessons has quietly raised: when a run
behaves strangely, how do you *see* what the graph actually did?

## References

LangChain. (n.d.-a). *Tools*. LangChain. https://langchain-ai.github.io/langgraphjs/concepts/low_level/

LangChain. (n.d.-b). *Persistence and checkpointers*. LangChain. https://langchain-ai.github.io/langgraphjs/concepts/persistence/

LangChain. (n.d.-c). *How to add human-in-the-loop with `interrupt`*. LangChain. https://langchain-ai.github.io/langgraphjs/how-tos/
