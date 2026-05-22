"use client";

/**
 * The model-configuration form on /admin: LLM provider, a model id per
 * LLM-calling node, generation defaults, and the tracing toggle. Saves to
 * PUT /api/admin/settings; a save takes effect on the next triage run.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  TRIAGE_NODES,
  type TriageLlmProvider,
  type TriageNode,
} from "@/agent/model-config";
import type { TriageSettings } from "@/lib/settings";

const PROVIDERS: { value: TriageLlmProvider; label: string }[] = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "google", label: "Google (Gemini)" },
];

const NODE_META: Record<TriageNode, { label: string; hint: string }> = {
  classify: { label: "Classify", hint: "Assigns the submission a category." },
  propose: { label: "Propose", hint: "Recommends an action." },
  draft_reply: { label: "Draft reply", hint: "Writes reply text (draftReply tool)." },
};

// Sentinel <select> value: "let me type an id the list does not have".
const CUSTOM = "__custom__";

const MODEL_OPTIONS: Record<TriageLlmProvider, { id: string; label: string }[]> =
  {
    anthropic: [
      { id: "claude-opus-4-7", label: "Claude Opus 4.7 (most capable)" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (balanced)" },
      {
        id: "claude-haiku-4-5-20251001",
        label: "Claude Haiku 4.5 (fast, low cost)",
      },
    ],
    google: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (most capable)" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (fast, free tier)" },
    ],
  };

const FIELD_CLASS =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 " +
  "dark:border-slate-700 dark:bg-slate-950";

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

interface Props {
  initialSettings: TriageSettings;
  /** TRIAGE_LLM_PROVIDER, when set, overrides the stored provider at runtime. */
  envProviderOverride: TriageLlmProvider | null;
  hasLangsmithKey: boolean;
}

export function SettingsForm({
  initialSettings,
  envProviderOverride,
  hasLangsmithKey,
}: Props) {
  const [settings, setSettings] = useState<TriageSettings>(initialSettings);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const provider = settings.provider;

  function patch(partial: Partial<TriageSettings>) {
    setSettings((s) => ({ ...s, ...partial }));
    setStatus({ kind: "idle" });
  }

  function setModel(node: TriageNode, value: string) {
    setSettings((s) => ({
      ...s,
      models: {
        ...s.models,
        [provider]: { ...s.models[provider], [node]: value },
      },
    }));
    setStatus({ kind: "idle" });
  }

  async function onSave() {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = (await res.json()) as {
        settings?: TriageSettings;
        error?: string;
      };
      if (!res.ok || !data.settings) {
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      setSettings(data.settings);
      setStatus({ kind: "saved" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Save failed",
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Provider */}
      <div>
        <h2 className="text-sm font-semibold">LLM provider</h2>
        <div className="mt-2 flex gap-4">
          {PROVIDERS.map((p) => (
            <label key={p.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="provider"
                checked={provider === p.value}
                onChange={() => patch({ provider: p.value })}
              />
              {p.label}
            </label>
          ))}
        </div>
        {envProviderOverride && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            The <code className="font-mono">TRIAGE_LLM_PROVIDER</code> env var
            is set to <strong>{envProviderOverride}</strong> and overrides this
            at runtime. Saving still records your choice for when the env var
            is removed.
          </p>
        )}
      </div>

      {/* Per-node model ids */}
      <div>
        <h2 className="text-sm font-semibold">Model per node · {provider}</h2>
        <p className="mt-1 text-xs text-slate-500">
          Pick a model for each LLM-calling node. Choose &ldquo;Custom model
          ID&rdquo; to enter one not in the list.
        </p>
        <div className="mt-2 space-y-3">
          {TRIAGE_NODES.map((node) => (
            <ModelField
              key={node}
              provider={provider}
              label={NODE_META[node].label}
              hint={NODE_META[node].hint}
              value={settings.models[provider][node]}
              onChange={(value) => setModel(node, value)}
            />
          ))}
        </div>
      </div>

      {/* Generation defaults */}
      <div>
        <h2 className="text-sm font-semibold">Generation defaults</h2>
        <p className="mt-1 text-xs text-slate-500">
          Applied when a node does not specify its own value.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Temperature (0–2)
            </span>
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={settings.temperature}
              onChange={(e) => patch({ temperature: Number(e.target.value) })}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Max tokens (64–8192)
            </span>
            <input
              type="number"
              min={64}
              max={8192}
              step={64}
              value={settings.maxTokens}
              onChange={(e) => patch({ maxTokens: Number(e.target.value) })}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </label>
        </div>
      </div>

      {/* Tracing */}
      <div>
        <h2 className="text-sm font-semibold">LangSmith tracing</h2>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.tracingEnabled}
            onChange={(e) => patch({ tracingEnabled: e.target.checked })}
          />
          Trace triage runs to LangSmith
        </label>
        {!hasLangsmithKey && (
          <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            No <code className="font-mono">LANGSMITH_API_KEY</code> is
            configured, so tracing stays off regardless of this toggle.
          </p>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <Button
          type="button"
          onClick={onSave}
          disabled={status.kind === "saving"}
        >
          {status.kind === "saving" ? "Saving…" : "Save settings"}
        </Button>
        {status.kind === "saved" && (
          <span
            role="status"
            className="text-sm text-emerald-700 dark:text-emerald-400"
          >
            Saved.
          </span>
        )}
        {status.kind === "error" && (
          <span role="alert" className="text-sm text-red-700 dark:text-red-400">
            {status.message}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * One node's model picker: a dropdown of curated model ids for the active
 * provider, plus a "Custom" option revealing a free-text input. The custom
 * state is derived from the value — a value absent from the list is custom.
 */
function ModelField({
  provider,
  label,
  hint,
  value,
  onChange,
}: {
  provider: TriageLlmProvider;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = MODEL_OPTIONS[provider];
  const isCustom = !options.some((option) => option.id === value);

  return (
    <div>
      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}{" "}
        <span className="font-normal text-slate-400">· {hint}</span>
      </span>
      <select
        value={isCustom ? CUSTOM : value}
        onChange={(e) =>
          onChange(e.target.value === CUSTOM ? "" : e.target.value)
        }
        className={`mt-1 ${FIELD_CLASS}`}
        aria-label={`${label} model`}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
        <option value={CUSTOM}>Custom model ID…</option>
      </select>
      {isCustom && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Exact model ID, e.g. claude-sonnet-4-6"
          aria-label={`${label} custom model ID`}
          className={`mt-2 font-mono ${FIELD_CLASS}`}
        />
      )}
    </div>
  );
}
