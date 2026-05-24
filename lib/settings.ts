import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { appSettings, type AppSettingsRow } from "@/db/schema";
import {
  DEFAULT_MODELS,
  TRIAGE_PROVIDERS,
  type TriageLlmProvider,
  type TriageNode,
} from "@/agent/model-config";
import { getEnv } from "@/lib/env";

/**
 * Runtime configuration for the triage agent — LLM provider, per-node model
 * ids, generation defaults, and the tracing toggle. Stored as one singleton
 * row in `app_settings` and edited from the `/admin` dashboard.
 *
 * Resolution order, highest priority first:
 *   1. `TRIAGE_LLM_PROVIDER` env var (provider only) — a hard override the
 *      accuracy eval depends on.
 *   2. the `app_settings` row.
 *   3. built-in defaults (`DEFAULT_MODELS` + the constants below).
 *
 * `getSettings()` is the hot path (`buildChatModel` calls it per build), so it
 * is cached briefly. `updateSettings()` clears the cache — a dashboard save
 * takes effect immediately.
 */
const SETTINGS_ID = "singleton";
const CACHE_TTL_MS = 10_000;
const DEFAULT_TEMPERATURE = 0;
const DEFAULT_MAX_TOKENS = 1024;

export interface TriageSettings {
  provider: TriageLlmProvider;
  models: Record<TriageLlmProvider, Record<TriageNode, string>>;
  temperature: number;
  maxTokens: number;
  tracingEnabled: boolean;
}

const VALID_PROVIDERS: ReadonlySet<TriageLlmProvider> = new Set(
  TRIAGE_PROVIDERS,
);

/**
 * Build the per-provider model map by spreading the built-in defaults under
 * whatever the stored row has for that provider. Slots a row doesn't carry
 * fall back to `DEFAULT_MODELS[provider][node]`.
 */
function mergedModels(
  stored: Partial<Record<TriageLlmProvider, Partial<Record<TriageNode, string>>>>,
): Record<TriageLlmProvider, Record<TriageNode, string>> {
  const out = {} as Record<TriageLlmProvider, Record<TriageNode, string>>;
  for (const provider of TRIAGE_PROVIDERS) {
    out[provider] = { ...DEFAULT_MODELS[provider], ...stored[provider] };
  }
  return out;
}

/** Default provider when there is no stored row — from whichever key is set. */
function keysDefaultProvider(): TriageLlmProvider {
  return getEnv().ANTHROPIC_API_KEY ? "anthropic" : "google";
}

/**
 * Build settings from an `app_settings` row (or built-in defaults when the row
 * is absent). Pure — does NOT apply the env-var override; see `getSettings`.
 */
export function resolveSettings(row: AppSettingsRow | null): TriageSettings {
  const stored = (row?.models ?? {}) as Partial<
    Record<TriageLlmProvider, Partial<Record<TriageNode, string>>>
  >;
  const storedProvider = row?.provider as TriageLlmProvider | undefined;
  const provider =
    storedProvider && VALID_PROVIDERS.has(storedProvider)
      ? storedProvider
      : keysDefaultProvider();
  return {
    provider,
    models: mergedModels(stored),
    temperature: row?.temperature ?? DEFAULT_TEMPERATURE,
    maxTokens: row?.maxTokens ?? DEFAULT_MAX_TOKENS,
    tracingEnabled: row
      ? row.tracingEnabled
      : Boolean(process.env.LANGSMITH_API_KEY),
  };
}

/** The `TRIAGE_LLM_PROVIDER` override, or null when unset/invalid. */
export function providerOverride(): TriageLlmProvider | null {
  const value = (process.env.TRIAGE_LLM_PROVIDER ?? "").toLowerCase();
  return VALID_PROVIDERS.has(value as TriageLlmProvider)
    ? (value as TriageLlmProvider)
    : null;
}

async function readRow(): Promise<AppSettingsRow | null> {
  try {
    const found = await getDb()
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, SETTINGS_ID))
      .limit(1);
    return found[0] ?? null;
  } catch {
    // Table missing (pre-migration) or DB unreachable — fall back to defaults.
    return null;
  }
}

/** Settings exactly as stored — no env override. Used by the `/admin` form. */
export async function getStoredSettings(): Promise<TriageSettings> {
  return resolveSettings(await readRow());
}

let cache: { value: TriageSettings; at: number } | null = null;

/** Effective settings (env override applied), cached for CACHE_TTL_MS. */
export async function getSettings(): Promise<TriageSettings> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }
  const stored = await getStoredSettings();
  const override = providerOverride();
  const value: TriageSettings = override
    ? { ...stored, provider: override }
    : stored;
  cache = { value, at: Date.now() };
  return value;
}

/** Drop the cache so the next `getSettings()` re-reads the database. */
export function invalidateSettingsCache(): void {
  cache = null;
}

/** Upsert the single settings row and clear the cache. */
export async function updateSettings(
  input: TriageSettings,
): Promise<TriageSettings> {
  const values = {
    id: SETTINGS_ID,
    provider: input.provider,
    models: input.models,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    tracingEnabled: input.tracingEnabled,
    updatedAt: new Date(),
  };
  await getDb()
    .insert(appSettings)
    .values(values)
    .onConflictDoUpdate({ target: appSettings.id, set: values });
  invalidateSettingsCache();
  return getStoredSettings();
}
