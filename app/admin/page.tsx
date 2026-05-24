import { getStoredSettings, providerOverride } from "@/lib/settings";
import {
  TRIAGE_PROVIDERS,
  type TriageLlmProvider,
} from "@/agent/model-config";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /admin — runtime LLM configuration. Picks the model each LLM-calling graph
 * node (classify, propose, draft_reply) uses, from dropdowns. A save takes
 * effect on the next triage run — no env edit, no redeploy.
 *
 * Which providers have keys set is computed here on the server (no secrets
 * leak — just true/false flags) so the form can mark a provider option as "no
 * key set" without an extra round-trip.
 */
export default async function AdminPage() {
  const settings = await getStoredSettings();
  const envProviderOverride = providerOverride();
  const hasLangsmithKey = Boolean(process.env.LANGSMITH_API_KEY);
  const providerKeyPresent = computeProviderKeyPresent();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        Admin · model configuration
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Choose the LLM provider and the model for each graph node. Changes
        apply to the next triage run — no redeploy.
      </p>
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <SettingsForm
          initialSettings={settings}
          envProviderOverride={envProviderOverride}
          hasLangsmithKey={hasLangsmithKey}
          providerKeyPresent={providerKeyPresent}
        />
      </div>
    </div>
  );
}

/**
 * Map provider → whether a credential is configured for it. Ollama needs no
 * API key (just a reachable base URL), so it is always treated as available.
 */
function computeProviderKeyPresent(): Record<TriageLlmProvider, boolean> {
  const map: Record<TriageLlmProvider, boolean> = {
    ollama: true,
    cerebras: Boolean(process.env.CEREBRAS_API_KEY),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    mistral: Boolean(process.env.MISTRAL_API_KEY),
    together: Boolean(process.env.TOGETHER_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    google: Boolean(process.env.GEMINI_API_KEY),
  };
  // Sanity: the type guarantees every provider in the union is covered.
  for (const p of TRIAGE_PROVIDERS) {
    if (!(p in map)) throw new Error(`Missing key-presence entry for ${p}`);
  }
  return map;
}
