# Quickstart: Durable HITL Interrupts with Postgres Checkpointer

> **Your human-in-the-loop agent silently loses state when the worker restarts.
> Here's the 10-line fix.**

A 30–45 minute, single-notebook Quickstart. You will run a human-in-the-loop
(HITL) LangGraph agent that pauses on `interrupt()`, watch it **lose the paused
state** when the process restarts under the default in-memory checkpointer, then
swap in `PostgresSaver` and watch the **exact same thread resume across a real
process restart**. Four lessons, one notebook, one `docker compose up`.

This is a **Quickstart**: a tour of *one* product surface — LangGraph's
`PostgresSaver` checkpointer paired with `interrupt()`. It is action-first. Every
lesson ends with the surface visibly doing something.

---

## ⛔ What this Quickstart will NOT cover

This list is load-bearing. A Quickstart earns its length by what it refuses to
teach. We are **not** covering:

- **A TypeScript track.** Python only. The LangGraph TS API has the same shape —
  the `witus-triage-agent` repo this course lives in *is* the TS version — so you
  can transfer the pattern yourself.
- **Alternative checkpointers** (SQLite, Redis, in-memory persistence, custom
  `BaseCheckpointSaver`). Postgres only.
- **Eval datasets / `pytest`-driven evaluation.** The verify step in Lesson 4 is
  manual: find the run in LangSmith, confirm the trace is continuous.
- **Multi-tenant auth.** Single-tenant local demo. No login, no per-user threads.
- **The architectural decision framework** for chain-vs-graph. That is
  Project-tier material (`docs/lessons/01-chain-to-graph.md` in this repo).
- **State-design discipline.** Also Project-tier
  (`docs/lessons/02-agent-state.md`).
- **The full LangGraph tools tour.** Only `interrupt()` survives here. The rest
  is `docs/lessons/03-tools-and-approval.md`.
- **An observability essay.** Lesson 4 is "find the run, see it's continuous,"
  not a tracing tutorial (`docs/lessons/04-observability.md` is the essay).
- **Cloud-hosted Postgres / production hardening.** Local `docker-compose` only.
- **The reflection-loop pattern** — that is the Foundation course
  (`wanderlearn-field-reporter`).
- **The per-agent RAG pattern** — that is the Project course
  (`centenarian-coach-multiagent`).

If you want any of those, the pointer is right there. This course is *only*
durability.

---

## What you'll build

A four-node triage graph — `intake → propose → human_approval → finalize` — a
deliberately minimal version of the production
[WitUS Triage Agent](../../agent/graph.ts) that ships in this repo. The
`human_approval` node calls `interrupt()`. You will prove that:

1. Under `MemorySaver`, a worker restart **destroys** the paused thread.
2. Under `PostgresSaver`, a worker restart **preserves** it — a brand-new process
   resumes the exact thread by id.
3. The whole episode shows up as **one continuous trace** in LangSmith.

The graph uses **deterministic nodes — no LLM call**. Durability is a property of
the *checkpointer*, not the model, so an API key would only add friction. Adding a
real model node is a one-liner; see [`migration-checklist.md`](./migration-checklist.md).

---

## Course outline (1 notebook · 4 lessons · ~35 min)

Open [`durable-hitl-quickstart.ipynb`](./durable-hitl-quickstart.ipynb) and run
top to bottom.

| Lesson | ~Time | The surface does something |
|:--|:--:|:--|
| **1. The crash test** | 5 min | Run the HITL agent with `MemorySaver`, pause on `interrupt()`, kill the process, try to resume in a fresh process — **the state is gone.** |
| **2. Swap to the Postgres checkpointer** | 10 min | `docker compose up -d`, swap `MemorySaver → PostgresSaver` (≈10 lines), rerun the same crash test — **the fresh process resumes the thread.** |
| **3. Durable interrupt patterns** | 10 min | *What* lives in the checkpointer vs in memory; why an `interrupt()` node must re-run from its first line and stay idempotent; the real rule taken from the triage codebase. |
| **4. Verify in LangSmith** | 5 min | Find the interrupted thread, confirm the resume is stitched into **one continuous trace** across the crash. |

Lessons 3 and 4 are kept distinct because they answer different questions
("*why* does it survive?" vs "*show me* it survived"). The Quickstart does not
split further.

---

## Setup (do this first — the surface responds in Lesson 1)

```bash
# 1. Python deps (3.11+). A virtualenv is recommended.
pip install -r requirements.txt

# 2. Start local Postgres (used from Lesson 2 on).
docker compose up -d --wait

# 3. (Optional, for Lesson 4) copy env and add your LangSmith key.
cp .env.example .env   # then edit LANGSMITH_API_KEY

# 4. Launch the notebook.
jupyter notebook durable-hitl-quickstart.ipynb
```

You need **Docker** and **Python 3.11+**. You do **not** need an LLM API key.
LangSmith is optional — the notebook runs without it; Lesson 4 is the only part
that uses it, and it fails soft if the key is missing.

### Forking this into your own repo

Everything in this directory is self-contained and MIT-licensed. Copy the four
files — the notebook, `docker-compose.yml`, `requirements.txt`, and
[`migration-checklist.md`](./migration-checklist.md) — into your own project and
you have a working durable-HITL starter. The migration checklist walks you
through pointing it at your own agent.

---

## Attribution

The notebook scaffold — the cell structure, the `requirements.txt` shape, and the
"find your run in LangSmith" pattern used in Lesson 4 — is **derived from
`langchain-ai/intro-to-langsmith` (MIT)** (LangChain, n.d.-a). Everything
else — the crash test, the `PostgresSaver` + `docker-compose` swap, the durable
interrupt-patterns lesson, and the migration checklist — is original to this
course.

This Quickstart is course #2 of 3 in a LangChain Academy portfolio. Siblings:
the Project course (`centenarian-coach-multiagent`) and the Foundation course
(`wanderlearn-field-reporter`).

---

## References

LangChain. (n.d.-a). *Intro to LangSmith* [Course notebooks]. GitHub.
https://github.com/langchain-ai/intro-to-langsmith

LangChain. (n.d.-b). *Add persistence (memory)* [LangGraph how-to guide].
https://langchain-ai.github.io/langgraph/how-tos/persistence/

LangChain. (n.d.-c). *How to add human-in-the-loop with interrupt*
[LangGraph how-to guide].
https://langchain-ai.github.io/langgraph/how-tos/human_in_the_loop/

LangChain. (n.d.-d). *PostgresSaver* [LangGraph checkpoint-postgres reference].
https://langchain-ai.github.io/langgraph/reference/checkpoints/

The PostgreSQL Global Development Group. (2024). *PostgreSQL 16 documentation:
Chapter 13, Concurrency control*.
https://www.postgresql.org/docs/16/mvcc.html
