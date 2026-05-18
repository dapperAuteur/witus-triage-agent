# Lesson 1 — From a chain to a graph

LangChain teaches you to build *chains*: a prompt feeds a model, the model feeds a
parser, the parser feeds the next prompt. Chains are linear, and for a surprising number
of tasks that is enough. This lesson is about the moment a chain stops being enough — and
how to recognize it *before* you have wedged branching logic into a pipeline that was
never meant to branch.

We will use the WitUS Triage Agent as the worked example. Its job: take a support
submission, classify it, gather context, propose an action, and — crucially — stop and
wait for a human before doing anything irreversible.

## The chain version

Start with just the first step. Classifying a submission is a textbook chain: one prompt,
one model call, one structured result.

```ts
const classifyChain = promptTemplate
  .pipe(model.withStructuredOutput(ClassificationSchema));

const classification = await classifyChain.invoke({ body: submission.body });
```

This is genuinely good code. It is easy to read, easy to test, and a chain is the right
tool here. If classification were the whole job, this lesson would end now. The LangGraph
documentation makes the same point: reach for the simplest abstraction that fits, and a
chain is simpler than a graph (LangChain, n.d.-a).

## Where the chain starts to strain

Now add the rest of the triage job. Three things happen, and each one is a small crack
in the linear model.

**1. A later step depends on several earlier ones.** The `propose` step needs the
classification *and* the enrichment *and* the original submission. In a chain you thread
this through by making each step return an ever-larger object — the output of step *n*
becomes a bag holding everything steps *1..n* produced. The bag grows. Nothing tells you
what is in it. This is the first smell.

**2. A step needs to make a decision about its own control flow.** After a human reviews
the proposal they might approve it, reject it, or edit it. Approval and edits lead to
*execution*; rejection leads to *logging and closing*. A chain runs every step in order;
it has no notion of "run this step OR that step." You can fake it with an `if` inside a
step, but now a single step secretly contains two unrelated behaviors, and the shape of
the program no longer matches the shape of the work.

**3. A step needs to pause — for minutes, hours, or days.** The human-approval gate is
not a function call that returns quickly. The graph must stop, persist everything it
knows, hand control back to a web request, and resume later — possibly in a different
process. A chain has no pause. `invoke()` runs start to finish. There is no seam to stop
at and nothing to resume.

Any one of these can sometimes be hacked around. All three together mean you are no
longer writing a pipeline. You are writing a *state machine*, and you should use the tool
built for state machines.

## The graph version

A graph keeps the model calls you already wrote — `classify` is still one structured
model call — but changes what *surrounds* them. Three new ideas replace the three cracks
above.

**State replaces the growing bag.** Instead of each step returning a bigger object, every
step reads from and writes to one shared, explicitly-typed state object. In this project
that is `TriageState` (see [`agent/state.ts`](../../agent/state.ts)). A node receives the
whole state and returns only the fields it changed; LangGraph merges the update. Lesson 2
is entirely about designing this object well.

**Edges replace the implicit order.** The graph wiring lives in one readable place —
[`agent/graph.ts`](../../agent/graph.ts):

```ts
new StateGraph(TriageStateAnnotation)
  .addNode("classify", classify)
  .addNode("enrich", enrich)
  .addNode("propose", propose)
  .addNode("human_approval", humanApproval)
  .addNode("execute", execute)
  .addNode("log_rejection", logRejection)
  .addEdge(START, "classify")
  .addEdge("classify", "enrich")
  .addEdge("enrich", "propose")
  .addEdge("propose", "human_approval")
  .addConditionalEdges("human_approval", routeAfterApproval, [
    "execute",
    "log_rejection",
  ])
  .addEdge("execute", END)
  .addEdge("log_rejection", END);
```

The `addConditionalEdges` line is decision #2 made explicit. `routeAfterApproval` is a
pure function — it looks at `state.approval.decision` and returns the name of the next
node. The branching is no longer hidden inside a step; it is a labelled fork in the
diagram, and the diagram *is* the code.

**Interrupts replace the impossible pause.** Decision #3 — pausing for a human — is what
LangGraph calls a human-in-the-loop interrupt (LangChain, n.d.-b). The `human_approval`
node calls `interrupt()`, which suspends the graph. A checkpointer persists the suspended
state to Postgres. A later HTTP request resumes the exact same run. Lesson 3 covers the
mechanics; the point here is only that a graph *has a seam to stop at* and a chain does
not.

## The test: do you actually need a graph?

Before every project, ask the three questions this lesson is built around:

1. Does a later step depend on the output of several earlier, non-adjacent steps?
2. Does the program need to choose between alternative steps at runtime?
3. Does the program need to pause and resume across process boundaries?

If the answer to all three is *no*, write a chain — it will be shorter and clearer. The
moment the answer to even one is *yes*, the graph is not over-engineering; it is the
honest shape of the problem. The WitUS Triage Agent answers *yes* to all three, which is
why it is a graph.

The next lesson takes the first new idea — shared state — and shows how to design it so
it stays an asset instead of becoming the growing bag in a new disguise.

## References

Anthropic. (n.d.). *Tool use with the Messages API*. Anthropic. https://docs.anthropic.com/en/docs/build-with-claude/tool-use

LangChain. (n.d.-a). *Why LangGraph?* LangChain. https://langchain-ai.github.io/langgraphjs/concepts/high_level/

LangChain. (n.d.-b). *Human-in-the-loop*. LangChain. https://langchain-ai.github.io/langgraphjs/concepts/human_in_the_loop/
