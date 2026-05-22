import { getStoredSettings, providerOverride } from "@/lib/settings";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /admin — runtime LLM configuration. Picks the model each LLM-calling graph
 * node (classify, propose, draft_reply) uses, from dropdowns. A save takes
 * effect on the next triage run — no env edit, no redeploy.
 */
export default async function AdminPage() {
  const settings = await getStoredSettings();
  const envProviderOverride = providerOverride();
  const hasLangsmithKey = Boolean(process.env.LANGSMITH_API_KEY);

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
        />
      </div>
    </div>
  );
}
