# LangGraph curriculum — 4 lessons

A short, code-along curriculum that teaches the LangGraph patterns this repository uses.
Each lesson is grounded in the real WitUS Triage Agent code — every snippet links to the
file it came from — so the curriculum and the application stay in sync.

Read them in order:

1. **[From a chain to a graph](01-chain-to-graph.md)** — the three questions that tell
   you when a linear chain has stopped being enough and you actually need a graph.
2. **[Designing agent state](02-agent-state.md)** — making the shared state object a
   contract, not a junk drawer; pure-function nodes; one schema, three jobs.
3. **[Tools and the human-in-the-loop interrupt](03-tools-and-approval.md)** — `tool()`
   wrappers with Zod schemas; `interrupt()` + the Postgres checkpointer; resuming a
   paused run with `Command`.
4. **[Observability: reading a trace](04-observability.md)** — fail-soft LangSmith
   tracing, and finding a real bug from a real trace.

The lesson prose follows the WitUS ecosystem APA-7 citation rule (see `CLAUDE.md`); each
file ends with a `## References` section.
