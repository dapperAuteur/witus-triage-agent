# Migration checklist — make *your* HITL agent durable

The take-home. You ran the crash test, swapped to `PostgresSaver`, learned the two
durability rules, and verified in LangSmith. Now do it to your own agent.

**Scope reminder:** this checklist is durability only — wiring `PostgresSaver`
into an existing `interrupt()`-based graph. It does **not** cover auth, cloud
Postgres, eval, or multi-agent design (see the course README out-of-scope list).

---

## 0. Prerequisites
- [ ] Your agent already pauses with `interrupt()` (or you add a `human_*` node
      that does). If it doesn't pause, there's nothing to make durable yet.
- [ ] You can reach a Postgres instance. No Docker Desktop required — pick any:
      **(A)** Docker engine via Colima (`brew install colima docker docker-compose
      && colima start`, then `docker compose up -d --wait` with this dir's
      `docker-compose.yml`); **(B)** Postgres.app (native macOS, zero containers —
      set `DB_URI=postgresql://localhost:5432/postgres?sslmode=disable`); or
      **(C)** Homebrew (`brew install postgresql@16 && brew services start
      postgresql@16`). The notebook/agent only needs the `DB_URI` string.

## 1. Install the checkpointer
- [ ] `pip install langgraph-checkpoint-postgres "psycopg[binary,pool]"`
- [ ] Pin the versions in your `requirements.txt` (copy this course's pins as a
      known-good baseline).

## 2. Swap the checkpointer (the ~10-line change)
- [ ] Replace `MemorySaver()` with:
      ```python
      from psycopg_pool import ConnectionPool
      from langgraph.checkpoint.postgres import PostgresSaver

      pool = ConnectionPool(conninfo=DB_URI, max_size=5,
                            kwargs={"autocommit": True, "prepare_threshold": 0})
      checkpointer = PostgresSaver(pool)
      checkpointer.setup()            # run ONCE per database; idempotent
      graph = builder.compile(checkpointer=checkpointer)
      ```
- [ ] Call `checkpointer.setup()` exactly once on a fresh database (it creates the
      `checkpoints*` tables). It's safe to call again — it no-ops if they exist.
- [ ] Keep `setup()` out of your hot path / per-request code. Run it at startup or
      as a migration step.

## 3. Honor the two durability rules
- [ ] **Everything you need on resume is in graph *state*.** Local variables, open
      connections, and module globals do **not** survive the restart — only the
      `State` channels your nodes return into. Audit each node: does it stash
      anything important *outside* the returned state dict? Move it in.
- [ ] **The `interrupt()` node is idempotent before the interrupt.** It re-runs
      from its first line on resume. Put no DB writes, no charges, no emails, no
      counters *before* the `interrupt()` call. Do side effects in the node
      *after* the gate, where they run exactly once. (TS reference:
      [`agent/nodes/humanApproval.ts`](../../agent/nodes/humanApproval.ts);
      `agent/nodes/execute.ts` is where the side effect belongs.)

## 4. Don't let drizzle / your ORM manage the checkpoint tables
- [ ] The `checkpoints`, `checkpoint_writes`, and `checkpoint_blobs` tables are
      **library-managed**. Exclude them from your migration tool's schema so it
      doesn't try to drop or alter them. (In this repo, they're deliberately
      absent from `db/schema.ts` — see [`agent/checkpointer.ts`](../../agent/checkpointer.ts).)

## 5. Use the unpooled connection for `setup()` if you're behind a pooler
- [ ] DDL through a transaction pooler (PgBouncer, Neon pooled URL) can misbehave.
      Point `setup()` at the **direct/unpooled** connection string; serve runtime
      traffic on whichever URL you like. (This repo uses
      `STORAGE_DATABASE_URL_UNPOOLED` for exactly this.)

## 6. Verify the way you did in the course
- [ ] Reproduce the crash test against *your* agent: pause it, restart the
      process, resume the same `thread_id`. It should pick up where it paused.
- [ ] Confirm in LangSmith that the resumed run shares the paused run's
      `thread_id` and starts from the persisted checkpoint.

---

When all boxes are checked, your human-in-the-loop agent survives a worker
restart. That's the whole course, applied.
