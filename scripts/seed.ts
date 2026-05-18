/**
 * Dev seed — loads the hand-labeled fixture submissions into the local
 * `submission` table so the triage graph has real-shaped data to run against
 * on a fresh Postgres.
 *
 * Run: `npm run db:seed` (after `npm run db:migrate`).
 *
 * Idempotent: every seeded row carries a `_fixture` marker in its payload;
 * a re-run deletes only previously-seeded rows, never real submissions.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
import { sql } from "drizzle-orm";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

interface Fixture {
  id: string;
  source: string;
  formType: string;
  submitterEmail?: string;
  submitterName?: string;
  priority: "normal" | "high";
  payload: Record<string, unknown>;
  expectedCategory: string;
}

async function main(): Promise<void> {
  // Imported lazily so the env is loaded before db/client reads it.
  const { getDb, getPool } = await import("../db/client");
  const { submissions } = await import("../db/schema");

  const fixturesPath = join(
    process.cwd(),
    "__tests__",
    "fixtures",
    "submissions.json",
  );
  const raw = readFileSync(fixturesPath, "utf8");
  const fixtures = (JSON.parse(raw) as { submissions: Fixture[] }).submissions;

  const db = getDb();

  // Remove only rows seeded by a previous run (payload has the `_fixture` key).
  const deleted = await db
    .delete(submissions)
    .where(sql`${submissions.payload} ? '_fixture'`)
    .returning({ id: submissions.id });
  if (deleted.length > 0) {
    console.log(`[seed] cleared ${deleted.length} previously-seeded row(s)`);
  }

  await db.insert(submissions).values(
    fixtures.map((f) => ({
      source: f.source,
      formType: f.formType,
      submitterEmail: f.submitterEmail ?? null,
      submitterName: f.submitterName ?? null,
      // The `_fixture` marker makes this row identifiable + idempotently
      // re-seedable. `expectedCategory` rides along for the accuracy check.
      payload: {
        ...f.payload,
        _fixture: f.id,
        _expectedCategory: f.expectedCategory,
      },
      priority: f.priority,
      receivedVia: "manual" as const,
    })),
  );

  console.log(`[seed] inserted ${fixtures.length} fixture submission(s)`);
  await getPool().end();
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
