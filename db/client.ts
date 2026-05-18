import "server-only";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { requireEnv } from "@/lib/env";
import * as schema from "./schema";

/**
 * Single node-postgres connection for the whole app.
 *
 * We use the `pg` (node-postgres) driver — not the Neon HTTP driver — for two
 * reasons: (1) the LangGraph Postgres checkpointer needs a real TCP
 * connection, and (2) the repo must run against a plain local Postgres. The
 * same `pool` is reused by the checkpointer (see agent/checkpointer.ts).
 *
 * The pool is cached on `globalThis` so Next.js HMR in dev does not leak a new
 * pool on every reload. `max` is kept small for serverless fan-out.
 */
type TriageDb = NodePgDatabase<typeof schema>;

interface PoolCache {
  pool: Pool | null;
  db: TriageDb | null;
}

const globalForDb = globalThis as unknown as { __triageDb?: PoolCache };

const cache: PoolCache = (globalForDb.__triageDb ??= { pool: null, db: null });

/** The shared node-postgres pool. Used by Drizzle and by the checkpointer. */
export function getPool(): Pool {
  if (cache.pool) return cache.pool;
  cache.pool = new Pool({
    connectionString: requireEnv("STORAGE_DATABASE_URL"),
    max: 5,
  });
  return cache.pool;
}

/** The Drizzle client. */
export function getDb(): TriageDb {
  if (cache.db) return cache.db;
  cache.db = drizzle(getPool(), { schema });
  return cache.db;
}

export type Db = TriageDb;
