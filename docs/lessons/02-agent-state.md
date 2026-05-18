# Lesson 2 — Designing agent state

Lesson 1 ended with a promise: shared state is what replaces the ever-growing bag of
return values that a chain accumulates. But "shared mutable object" is also a description
of a junk drawer. This lesson is about the difference — how to design a state object that
stays legible as the graph grows.

The worked example is `TriageState`, defined in [`agent/state.ts`](../../agent/state.ts).

## State is the contract between nodes

In a LangGraph application, nodes do not call each other. `classify` does not call
`enrich`. They are independent functions wired together by edges, and the *only* thing
they share is the state object. That makes the state the contract: it is the complete,
written-down answer to "what can a node rely on, and what is a node allowed to produce?"

A good contract has two properties. It is **explicit** — every field is named and typed,
so a new node author can read the state definition and know exactly what is available.
And it is **honest** — a field exists only if some node genuinely produces it and some
node genuinely consumes it. The junk drawer fails both: things end up in it "just in
case," and nobody can tell what is load-bearing.

## The shape of `TriageState`

Here is the state, lightly abridged:

```ts
export const TriageStateAnnotation = Annotation.Root({
  rawSubmission: Annotation<RawSubmission>,
  classification: Annotation<Classification | undefined>,
  enrichment: Annotation<Enrichment | undefined>,
  proposedAction: Annotation<ProposedAction | undefined>,
  approval: Annotation<Approval | undefined>,
  execution: Annotation<Execution | undefined>,
});

export type TriageState = typeof TriageStateAnnotation.State;
```

Two design decisions are worth pausing on.

**One field per pipeline stage.** `rawSubmission` is the input, set once. The other five
fields each correspond to exactly one node's output: `classify` writes `classification`,
`enrich` writes `enrichment`, and so on. There is a one-to-one mapping between a field
and the node that owns it. You never have to wonder who set a value — the field name
tells you. This is the discipline that keeps the object from becoming a drawer: a field
must be *earned* by a producing node.

**Every later-stage field is optional.** When the graph starts, only `rawSubmission`
exists; `classification` and the rest are `undefined`. They fill in as the run
progresses. The optionality is not sloppiness — it is the type system telling the truth
about time. At the `enrich` node, `classification` is defined but `proposedAction` is
not, and the `| undefined` makes a node author handle the case where an upstream value
is missing (because a node *can* fail soft and leave its field unset).

## Nodes are pure functions of state

A LangGraph node has a deliberately small signature: it takes the state and returns a
*partial* update.

```ts
export async function classify(
  state: TriageState,
): Promise<TriageStateUpdate> {
  const classification = await runTheModel(state.rawSubmission);
  return { classification };
}
```

`classify` returns `{ classification }` — just the one field it owns. It does not return
a new whole-state object; LangGraph merges the partial into the running state with a
last-write-wins reducer. This is the same idea as a reducer in Redux or the `useReducer`
hook: the node describes a *change*, not a *new world*.

Keeping nodes pure — no side effects, output determined only by input — buys three
things. They are trivially unit-testable: construct a state, call the function, assert on
the partial it returns (see [`__tests__/agent/classify.test.ts`](../../__tests__/agent/classify.test.ts)).
They are safe to re-run, which matters enormously for interrupts — Lesson 3 will show a
node that LangGraph executes *twice*. And they compose without surprises, because a pure
function cannot reach out and disturb something a sibling node depended on.

This project enforces one explicit exception: the `execute` and `log_rejection` nodes are
*allowed* side effects, because their entire job is to act on the world after approval.
Naming the exception out loud — in the code and in the style guide — is itself a design
choice. The rule "nodes are pure" is only useful if the two places it does not hold are
impossible to miss.

## Make the runtime schema and the type the same thing

There is one more failure mode specific to LLM applications. The `classify` node asks the
model for structured output matching `Classification`. That shape now exists *twice*: as
a TypeScript type the compiler checks, and as a runtime schema the model is told to fill.
If those two drift apart — you add a field to one and forget the other — you get a class
of bug the compiler cannot catch.

The fix is to not have two things. In [`agent/schemas.ts`](../../agent/schemas.ts) the
Zod schema is the single source of truth, and the TypeScript type is *derived* from it:

```ts
export const ClassificationSchema = z.object({
  category: z.enum(TRIAGE_CATEGORIES),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});
export type Classification = z.infer<typeof ClassificationSchema>;
```

`z.infer` means the type cannot disagree with the schema — it *is* the schema, read at
compile time. The same schema object is handed to the model via `.withStructuredOutput()`
and used to validate the model's reply at runtime (Anthropic, n.d.). One definition,
three jobs: compile-time type, runtime validation, and the instruction to the model.

## A checklist for your own state

When you design the state object for your own graph, run each candidate field past these
questions:

- **Who writes it?** If no node produces it, delete it.
- **Who reads it?** If no node consumes it, delete it — or it is really logging, which
  belongs in an audit table, not in graph state.
- **Is it optional?** If it is not set at `START`, its type must say so.
- **Does its shape exist elsewhere?** If a model or a database row also needs the shape,
  derive every copy from one schema.

State designed this way stays a contract. Lesson 3 puts it to work: wiring tools with the
same Zod discipline, and using the optionality of `approval` to build the
human-in-the-loop pause.

## References

Anthropic. (n.d.). *Increase output consistency with structured outputs*. Anthropic. https://docs.anthropic.com/en/docs/build-with-claude/tool-use

LangChain. (n.d.). *State management in LangGraph*. LangChain. https://langchain-ai.github.io/langgraphjs/concepts/low_level/

Zod. (n.d.). *Type inference*. Zod. https://zod.dev/
