import "server-only";
import { Pool } from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { getEnv } from "@/lib/env";

/**
 * The LangGraph Postgres checkpointer.
 *
 * This is what makes the human-in-the-loop pause durable: when the graph hits
 * `interrupt()` in the `human_approval` node, the checkpointer persists the
 * full graph state to Postgres. A later HTTP request (the operator's approval)
 * resumes the exact same thread — even across process restarts.
 *
 * The checkpointer owns its OWN tables (`checkpoints`, `checkpoint_writes`,
 * `checkpoint_blobs`, …), created by `setup()`. Those are library-managed and
 * deliberately absent from `db/schema.ts` — drizzle-kit must not touch them.
 *
 * It uses a dedicated `pg.Pool` on the UNPOOLED url: `setup()` issues DDL, and
 * a direct connection sidesteps pooler quirks. We construct the pool ourselves
 * (rather than `PostgresSaver.fromConnString`) so it can be closed cleanly —
 * important for test teardown.
 */
interface CheckpointerCache {
  pool: Pool | null;
  saver: PostgresSaver | null;
  setupDone: boolean;
}

const globalForCheckpointer = globalThis as unknown as {
  __triageCheckpointer?: CheckpointerCache;
};

const cache: CheckpointerCache = (globalForCheckpointer.__triageCheckpointer ??=
  {
    pool: null,
    saver: null,
    setupDone: false,
  });

/**
 * Get the checkpointer, running its one-time `setup()` on first use. Cached on
 * `globalThis` so the pool and the setup survive Next.js HMR in dev.
 */
export async function getCheckpointer(): Promise<PostgresSaver> {
  const env = getEnv();
  const connString =
    env.STORAGE_DATABASE_URL_UNPOOLED ?? env.STORAGE_DATABASE_URL;
  if (!connString) {
    throw new Error(
      "STORAGE_DATABASE_URL_UNPOOLED (or STORAGE_DATABASE_URL) is required " +
        "for the LangGraph checkpointer.",
    );
  }

  if (!cache.pool) {
    cache.pool = new Pool({ connectionString: connString, max: 3 });
  }
  if (!cache.saver) {
    cache.saver = new PostgresSaver(cache.pool);
  }
  if (!cache.setupDone) {
    await cache.saver.setup();
    cache.setupDone = true;
  }
  return cache.saver;
}

/** Close the checkpointer's connection pool. Used by test teardown. */
export async function closeCheckpointer(): Promise<void> {
  if (cache.pool) {
    await cache.pool.end();
  }
  cache.pool = null;
  cache.saver = null;
  cache.setupDone = false;
}
