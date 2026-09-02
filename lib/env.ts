import "server-only";
import { z } from "zod";
import {
  endSessionEndpointFromDiscovery,
  silentSsoEndpointFromDiscovery,
} from "@/lib/silent-sso";

/**
 * Ecosystem default for the WitUS IdP's OIDC discovery document.
 *
 * A LABELLED FALLBACK, not an assertion: `WITUS_OIDC_DISCOVERY_URL` is the
 * authoritative value and always wins. It lives here so `lib/auth.ts` (the
 * provider) and the two derived endpoints below cannot drift apart and end up
 * probing a different host than the one the click signs in against.
 */
export const WITUS_OIDC_DISCOVERY_FALLBACK =
  "https://accounts.witus.online/api/idp/.well-known/openid-configuration";

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

  /** Anthropic API key — the paid production LLM (Claude Sonnet 4.6). */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  /** Google Gemini API key — the paid LLM (Gemini 2.5 Flash, also has a free tier). */
  GEMINI_API_KEY: z.string().min(1).optional(),
  /** Cerebras free tier — Llama 3.3 70B via an OpenAI-compatible endpoint. */
  CEREBRAS_API_KEY: z.string().min(1).optional(),
  /** OpenRouter — `:free` models via OpenAI-compatible endpoint. */
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  /** Mistral API key — its own SDK; free tier 1B tokens/month. */
  MISTRAL_API_KEY: z.string().min(1).optional(),
  /** Together AI — Llama 3.3 70B Turbo Free via OpenAI-compatible endpoint. */
  TOGETHER_API_KEY: z.string().min(1).optional(),
  /** Local Ollama base URL. Defaults to http://localhost:11434 in `model.ts`. */
  OLLAMA_BASE_URL: z.string().url().optional(),
  /** Force a provider. Optional — auto-detected from the keys above if unset. */
  TRIAGE_LLM_PROVIDER: z
    .enum([
      "anthropic",
      "google",
      "ollama",
      "cerebras",
      "openrouter",
      "mistral",
      "together",
    ])
    .optional(),
  /**
   * Comma-separated fallback chain for `buildChatModelWithFallback`. When the
   * primary throws, LangChain's `withFallbacks` tries each in turn. Example:
   * `openrouter,anthropic` — OpenRouter catches Cerebras's daily quota, then
   * Anthropic catches everything as the paid emergency tier.
   */
  TRIAGE_FALLBACK_PROVIDERS: z.string().optional(),

  /**
   * Error monitoring (Better Stack, ingesting the `@sentry/nextjs` SDK). Entirely optional: with
   * no DSN the SDK never calls `init()` and is inert.
   *
   * Declared here for documentation and validation completeness only. The runtime configs
   * (`sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`) read
   * `process.env` DIRECTLY, because this module imports `server-only` and those files also load in
   * the browser and instrumentation contexts. `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN`
   * are build-time only (source map upload) and read in `next.config.ts`.
   *
   * Not `.url()` on purpose: a malformed DSN must never make `getEnv()` throw and take the app
   * down. A bad DSN should cost us the error report, not the request.
   */
  SENTRY_DSN: z.string().min(1).optional(),
  SENTRY_ENVIRONMENT: z.string().min(1).optional(),
  SENTRY_ORG: z.string().min(1).optional(),
  SENTRY_PROJECT: z.string().min(1).optional(),

  /**
   * Honeycomb distributed tracing (OpenTelemetry via @vercel/otel — witus plan 30 §7).
   * Entirely optional: with neither key set, `otel.config.ts` never registers a tracer
   * provider and every span in the app is a no-op. Declared here for documentation and
   * validation completeness only — `otel.config.ts` reads `process.env` DIRECTLY (it loads
   * from `instrumentation.ts`, outside this module's `server-only` chain). The `_SECRET`
   * feeds the `x-honeycomb-team` ingest header; `HONEYCOMB_API_KEY` is the fallback.
   */
  HONEYCOMB_INGEST_API_KEY_SECRET: z.string().min(1).optional(),
  HONEYCOMB_API_KEY: z.string().min(1).optional(),

  /**
   * Better Stack heartbeat URL, pinged at the end of each SUCCESSFUL processing run
   * (`lib/heartbeat.ts`); a missed ping is the dead-run alarm. Optional: unset means no
   * ping, no error. Read from `process.env` directly by `lib/heartbeat.ts`; declared here
   * for documentation + validation completeness. Not `.url()` on purpose — a malformed
   * value should cost the ping, never a `getEnv()` throw.
   */
  BETTERSTACK_HEARTBEAT_URL: z.string().min(1).optional(),

  /** LangSmith tracing — entirely optional; the SDK no-ops without it. */
  LANGSMITH_API_KEY: z.string().min(1).optional(),
  LANGSMITH_PROJECT: z.string().min(1).optional(),
  LANGSMITH_TRACING: z.string().optional(),

  /** NextAuth — required once the operator UI / protected routes exist. */
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(16).optional(),
  /** The single email allowed to sign in to the operator dashboard. */
  ADMIN_EMAIL: z.string().email().optional(),
  /** SMTP connection string for NextAuth's magic-link EmailProvider. */
  EMAIL_SERVER: z.string().min(1).optional(),
  /** From-address for magic-link emails, e.g. "WitUS Triage <triage@…>". */
  EMAIL_FROM: z.string().min(1).optional(),

  /**
   * "Sign in with WitUS" ecosystem OIDC provider (accounts.witus.online).
   * The provider is enabled only when WITUS_OIDC_CLIENT_ID is set. Read from
   * `process.env` directly in `lib/auth.ts`; declared here for documentation +
   * validation completeness. NEXT_PUBLIC_WITUS_SSO (the button's build-time
   * visibility flag) is client-side and intentionally not in this server schema.
   */
  WITUS_OIDC_CLIENT_ID: z.string().min(1).optional(),
  WITUS_OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  WITUS_OIDC_DISCOVERY_URL: z.string().url().optional(),
  /**
   * Override for the silent "Continue as ..." probe endpoint. Normally unset —
   * it is derived from the discovery URL above. Present because the path is
   * owned by the IdP app, not by this one, so an explicit value must be able to
   * win without a code change here.
   */
  WITUS_SSO_SESSION_URL: z.string().url().optional(),

  /** Shared HMAC secret for the inbox -> /api/triage/start webhook. */
  TRIAGE_INGEST_SECRET: z.string().min(16).optional(),

  /** Mobile Text Alerts — used by the escalateSms tool. */
  MOBILE_TEXT_ALERTS_API_KEY: z.string().min(1).optional(),
  MOBILE_TEXT_ALERTS_RECIPIENTS: z.string().optional(),

  /**
   * Outbound WitUS Inbox webhook — waitlist signups are published to the
   * central Inbox. Distinct from TRIAGE_INGEST_SECRET (the inbound webhook).
   * `lib/submit-to-inbox.ts` reads these from `process.env` directly; they
   * are declared here for documentation + validation completeness.
   */
  INBOX_INGEST_URL: z.string().url().optional(),
  INBOX_INGEST_SECRET: z.string().min(1).optional(),
  INBOX_SOURCE_SLUG: z.string().min(1).optional(),
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

/**
 * Where the sign-in page's silent "Continue as ..." check asks the WitUS IdP
 * who this browser is — or `null`, which keeps the whole feature dark.
 *
 * Dark unless `WITUS_OIDC_CLIENT_ID` is set, because an affordance the operator
 * cannot complete is worse than no affordance. The URL is either set explicitly
 * or DERIVED from the discovery URL this app already points at, so nothing new
 * about accounts.witus.online is asserted here.
 *
 * A FUNCTION, not a module-level constant: `getEnv()` is deliberately lazy in
 * this repo so Next's build-time analysis never trips on an env read at module
 * top level. Same reasoning applies here.
 */
export function witusSilentSsoEndpoint(): string | null {
  const env = getEnv();
  if (!env.WITUS_OIDC_CLIENT_ID) return null;
  return (
    env.WITUS_SSO_SESSION_URL ??
    silentSsoEndpointFromDiscovery(
      env.WITUS_OIDC_DISCOVERY_URL ?? WITUS_OIDC_DISCOVERY_FALLBACK,
    )
  );
}

/**
 * Where sign-out ends the SHARED WitUS session (BAM's decision, 2026-08-30:
 * signing out of one WitUS app signs you out of all of them) — or `null`, in
 * which case sign-out stays purely local.
 *
 * Dark under exactly the same condition as the probe: if this app is not a
 * configured ecosystem OIDC client there is no shared session to end.
 *
 * `client_id` is baked in HERE, on the server, and is REQUIRED rather than
 * optional: better-auth rejects a `post_logout_redirect_uri` with
 * `invalid_request` unless the request carries a verifiable `id_token_hint` or
 * an explicit `client_id`, and we have no id_token client-side. The sign-out
 * button is a client component and must never be handed the raw env, so it
 * receives this finished string and only appends the redirect URI.
 */
export function witusEndSessionEndpoint(): string | null {
  const env = getEnv();
  const clientId = env.WITUS_OIDC_CLIENT_ID;
  if (!clientId) return null;
  const base = endSessionEndpointFromDiscovery(
    env.WITUS_OIDC_DISCOVERY_URL ?? WITUS_OIDC_DISCOVERY_FALLBACK,
  );
  if (!base) return null;
  return `${base}?client_id=${encodeURIComponent(clientId)}`;
}
