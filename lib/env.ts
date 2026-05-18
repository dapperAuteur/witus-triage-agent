import "server-only";
import { z } from "zod";

/**
 * Environment access for the triage agent.
 *
 * Design: lenient by default. Every variable is OPTIONAL here so that
 * `getEnv()` never throws just because a key is unset — the app must still
 * boot with, say, `LANGSMITH_API_KEY` missing (PRD §15: fail soft, not hard).
 * Consumers that genuinely need a value call `requireEnv()`, which throws a
 * clear, named error at the point of use.
 *
 * Values that ARE present are still format-checked.
 */
const EnvSchema = z.object({
  /** Pooled Postgres connection — used by the app at runtime. */
  STORAGE_DATABASE_URL: z.string().url().optional(),
  /** Direct/unpooled connection — used by drizzle-kit migrations + DDL. */
  STORAGE_DATABASE_URL_UNPOOLED: z.string().url().optional(),

  /** Anthropic API key — the production LLM (Claude Sonnet 4.6). */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  /** Google Gemini API key — the testing LLM (Gemini 2.5 Flash, free tier). */
  GEMINI_API_KEY: z.string().min(1).optional(),
  /** Force a provider. Optional — auto-detected from the keys above if unset. */
  TRIAGE_LLM_PROVIDER: z.enum(["anthropic", "google"]).optional(),

  /** LangSmith tracing — entirely optional; the SDK no-ops without it. */
  LANGSMITH_API_KEY: z.string().min(1).optional(),
  LANGSMITH_PROJECT: z.string().min(1).optional(),
  LANGSMITH_TRACING: z.string().optional(),

  /** NextAuth — required once the operator UI / protected routes exist. */
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(16).optional(),
  /** The single email allowed to sign in to the operator dashboard. */
  ADMIN_EMAIL: z.string().email().optional(),

  /** Shared HMAC secret for the inbox -> /api/triage/start webhook. */
  TRIAGE_INGEST_SECRET: z.string().min(16).optional(),

  /** Mobile Text Alerts — used by the escalateSms tool. */
  MOBILE_TEXT_ALERTS_API_KEY: z.string().min(1).optional(),
  MOBILE_TEXT_ALERTS_RECIPIENTS: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/**
 * Lazy, cached env getter. Validates on first call. Call this inside a
 * request handler or server function — never at module top level — so
 * Next's build-time analysis does not trip on it.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * Read a variable that the calling code cannot function without. Throws a
 * clear, named error if it is absent — surfaced at the point of use rather
 * than failing the whole process at boot.
 */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = getEnv()[key];
  if (value === undefined || value === "") {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
        `See .env.example and plans/user-tasks/01-provision-env-and-secrets.md.`,
    );
  }
  return value as NonNullable<Env[K]>;
}
