# WitUS Triage Agent

A LangGraph agent that classifies incoming **WitUS Inbox** submissions, enriches them
with customer and product context, proposes an action, and routes through a
**human-in-the-loop approval gate** before doing anything irreversible.

It is shared infrastructure in the [WitUS ecosystem](https://witus.online) — sibling to
WitUS Inbox — and a portfolio piece demonstrating three core LangGraph patterns in real
production code: **graph state**, **tool calls**, and **human-in-the-loop interrupts**.

```
classify → enrich → propose → human approval → execute | log rejection
```

> **Build status — Day 6 of 7.** The full graph (classify → enrich → propose →
> human-approval interrupt → execute / log-rejection), the API surface, the operator
> dashboard, LangSmith wiring, and the 4-lesson curriculum are all in. Day 7 is polish
> and the accuracy check. See
> [`plans/PRD-1-witus-triage-agent.md`](plans/PRD-1-witus-triage-agent.md) for the full
> spec and the phased build plan.

---

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 20+, Next.js 16 (app router), TypeScript strict |
| Agent | `@langchain/langgraph` 1.x |
| LLM | Gemini 2.5 Flash for testing · Claude Sonnet 4.6 for production (dual-provider) |
| Database | Postgres (local) / Neon (deployed) via Drizzle ORM on `node-postgres` |
| Observability | LangSmith (`langsmith`) — optional, fail-soft |
| Auth | NextAuth v4 (operator dashboard, Day 4+) |
| UI | Tailwind v4 — WitUS Inbox identity (violet on slate) |
| Tests | Vitest |

---

## Run it locally (fresh Postgres → running graph)

You need **Node 20+** and a **Postgres 16** database. This repo owns its own database —
it does *not* connect to the live WitUS Inbox DB.

```bash
# 1. Install dependencies
npm install

# 2. Create a database
createdb witus_triage_agent

# 3. Configure environment
cp .env.example .env.local
#    Fill in at minimum:
#      STORAGE_DATABASE_URL=postgresql://localhost:5432/witus_triage_agent
#      STORAGE_DATABASE_URL_UNPOOLED=postgresql://localhost:5432/witus_triage_agent
#      GEMINI_API_KEY=...        (testing — or ANTHROPIC_API_KEY for production)
#    Secret generation + every variable is documented in
#    plans/user-tasks/01-provision-env-and-secrets.md

# 4. Create the tables
npm run db:migrate

# 5. Load the hand-labeled fixture submissions
npm run db:seed

# 6. Run the dev server
npm run dev          # http://localhost:3000
```

To exercise the `classify` node, run the test suite with an Anthropic key set (below).

---

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (run once) |
| `npm run db:generate` | Generate a migration from `db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Load fixture submissions |
| `npm run db:studio` | Drizzle Studio |

### Tests

```bash
npm test
```

The `classify` tests make a live LLM call, so they are **skipped** unless `GEMINI_API_KEY`
or `ANTHROPIC_API_KEY` is set — CI without a key stays green. With a key set, they run the
node against 5 labeled fixtures and assert each produces a valid classification.

---

## Project structure

```
agent/
  schemas.ts        Zod schemas + inferred types for every state payload
  state.ts          TriageState — the object that flows through the graph
  model.ts          Chat-model factory (Claude Sonnet 4.6)
  graph.ts          The compiled graph (Day 1: classify only)
  nodes/
    classify.ts     LLM structured-output classification
db/
  schema.ts         Drizzle schema — submission mirror + triage_runs + triage_audit_log
  client.ts         node-postgres pool + Drizzle client
  migrations/       Generated SQL migrations
lib/
  env.ts            Lazy, fail-soft environment access
app/                Next.js app router (operator UI lands Day 5)
scripts/
  seed.ts           Loads fixture submissions
__tests__/          Vitest suites + labeled fixtures
docs/
  STYLEGUIDE.md     Code + style guide (read before adding code or UI)
  lessons/          4-lesson LangGraph curriculum (Day 6)
plans/
  PRD-1-...md        The product requirements doc
  user-tasks/        Operator task queue (env, secrets, cross-repo work)
```

---

## How it works

The agent is a LangGraph state machine. Each node is a **pure function of state** —
it receives `TriageState`, returns a partial update, and LangGraph merges it. Side
effects happen only in `execute` and `log_rejection`.

The human-in-the-loop gate uses a real LangGraph `interrupt()`: the graph runs
`classify → enrich → propose`, pauses, and a Postgres checkpointer persists its state.
A later HTTP request resumes the exact same graph thread with the operator's decision.

See [`docs/STYLEGUIDE.md`](docs/STYLEGUIDE.md) for code conventions and the resolved
WitUS design tokens.

---

## Curriculum

A 4-lesson, code-along walkthrough of the LangGraph patterns in this repo — every
snippet links to the file it came from:

1. [From a chain to a graph](docs/lessons/01-chain-to-graph.md) — when a linear chain
   stops being enough.
2. [Designing agent state](docs/lessons/02-agent-state.md) — the state object as a
   contract; pure-function nodes.
3. [Tools and the human-in-the-loop interrupt](docs/lessons/03-tools-and-approval.md) —
   Zod-schema tools; `interrupt()` + the checkpointer; resuming with `Command`.
4. [Observability: reading a trace](docs/lessons/04-observability.md) — fail-soft
   LangSmith; debugging from a trace.

Index: [`docs/lessons/`](docs/lessons/README.md).

---

## License & ecosystem

Part of the WitUS ecosystem — © B4C LLC, an AwesomeWebStore.com brand.
