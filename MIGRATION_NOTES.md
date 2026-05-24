# Migration notes — `feat/llm-provider-swap`

**Goal:** add five free LLM providers (Ollama local + four hosted free tiers) to
the triage agent so the dev loop and the deployed demo can run at $0 in the
normal case, while Anthropic and Google remain available as paid options for
quality or emergency use.

## Files changed

### Factory + dispatch
- `agent/model-config.ts` — `TRIAGE_PROVIDERS` is now a `const` tuple sourced
  from a single seven-member list; `TriageLlmProvider` is derived from it.
  New constants `OLLAMA_MODEL` / `CEREBRAS_MODEL` / `OPENROUTER_MODEL` /
  `MISTRAL_MODEL` / `TOGETHER_MODEL`. New maps `PROVIDER_COST_CLASS`,
  `PROVIDER_LABELS`. `DEFAULT_MODELS` now has seven rows.
- `agent/model.ts` — `buildChatModel` rewritten with an exhaustive
  `switch (provider)` ending in `const _exhaustive: never`. New cases:
  `ollama` (ChatOllama), `mistral` (ChatMistralAI), and `cerebras` / `openrouter`
  / `together` (ChatOpenAI with `configuration.baseURL`). `BuildChatModelOptions`
  gains an optional `provider` override the fallback chain uses to build models
  for specific providers regardless of stored settings. `resolveProvider()`
  accepts all seven providers.
- `agent/with-fallback.ts` — new. Exports `parseFallbackProviders()` (parses
  `TRIAGE_FALLBACK_PROVIDERS` env var, drops unknowns, lower-cases) and
  `buildChatModelWithFallback({ node, ... })` which wraps the primary chat
  model with LangChain's `withFallbacks([...])` when the env var is set.

### Call sites
- `agent/nodes/classify.ts`, `agent/nodes/propose.ts`,
  `agent/tools/draftReply.ts` — each switched from `buildChatModel` to
  `buildChatModelWithFallback`. The accuracy eval still uses bare
  `buildChatModel` (via `classify()`) so eval runs pin to one provider.

### Settings + persistence
- `lib/settings.ts` — `resolveSettings` now spreads `DEFAULT_MODELS` for **every**
  provider via a new `mergedModels()` helper; `providerOverride()` accepts all
  seven providers. No DB migration needed — the `app_settings.models` column is
  `jsonb` and the new keys are added lazily on save.
- `lib/env.ts` — Zod schema gains `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY`,
  `MISTRAL_API_KEY`, `TOGETHER_API_KEY`, `OLLAMA_BASE_URL`,
  `TRIAGE_FALLBACK_PROVIDERS`; `TRIAGE_LLM_PROVIDER` enum extended to all seven.
- `app/api/admin/settings/route.ts` — Zod schema for PUT body derived from
  `TRIAGE_PROVIDERS` so adding a provider propagates.

### Dashboard UI
- `app/admin/page.tsx` — server component now computes
  `providerKeyPresent: Record<TriageLlmProvider, boolean>` from env and passes
  it to the form. No secret values leak — just true/false flags.
- `app/admin/settings-form.tsx` — provider radio replaced with a grouped
  `<select>` (Free / Paid `<optgroup>`s); each option's label includes the cost
  class and a "no API key set" suffix when applicable. A persistent banner
  above the form is amber when a paid provider is active, green otherwise. The
  per-node `MODEL_OPTIONS` map extended to all seven providers.

### Config + docs
- `.env.example` — Free-vs-paid block; all five new key slots documented with
  signup URLs; `TRIAGE_FALLBACK_PROVIDERS` documented with the recommended
  deployed-demo value (`openrouter,anthropic`).
- `plans/user-tasks/08-provision-free-provider-keys.md` — new operator task
  for BAM: sign up, paste keys into `.env.local` + Vercel env, trigger deploy.
- `plans/user-tasks/00-descriptions.md` — index row added for task 08.

### Tests
- `__tests__/agent/model.test.ts` — new. Eleven cases covering:
  per-provider dispatch (all seven), missing-API-key throw for hosted
  providers, the per-call `provider` override winning over settings, and
  `parseFallbackProviders` parsing / trimming / unknown-dropping.

### Dependencies
- Added: `@langchain/ollama`, `@langchain/openai`, `@langchain/mistralai`.
- Kept: `@langchain/anthropic`, `@langchain/google-genai`. Selectable in
  `/admin` as the paid options and available as emergency fallbacks.

## Verification

- `npm run typecheck` — green.
- `npm run lint` — green.
- `npm test` — **7 files, 32 passed, 5 skipped** (eval suite, properly gated
  behind `RUN_EVAL=1`).

## Per-provider eval re-runs

**Not yet executed.** The eval requires either Ollama running locally or a key
for one of the new hosted providers in `.env.local`; neither is configured on
this machine and the operator task to provision them is filed at
`plans/user-tasks/08-provision-free-provider-keys.md`. Once that lands, run:

```bash
TRIAGE_LLM_PROVIDER=ollama       npm run eval     # local, no keys needed
TRIAGE_LLM_PROVIDER=cerebras     npm run eval     # ~25 calls, daily quota
TRIAGE_LLM_PROVIDER=openrouter   npm run eval     # for fallback comparison
```

Each run appends a new section to `EVAL.md` (the eval hardening from
`plans/01-fix-accuracy-eval.md` ensures an aborted run records `Status:
aborted — infrastructure failure` rather than a fake percentage). The
committed Claude Sonnet 4.6 baseline (100% / 25) stays as the first section
— it is honest history, not the deployed model after this lands.

## Deployment shape

For the live demo, the recommended Vercel env values are:

```
TRIAGE_LLM_PROVIDER=cerebras
TRIAGE_FALLBACK_PROVIDERS=openrouter,anthropic
```

Cerebras handles normal traffic at $0; OpenRouter catches Cerebras's daily
quota wall (also free); Anthropic is the **paid emergency tier** so a reviewer
clicking the demo URL never sees a hard failure. In the normal case the demo
costs $0; in the worst case it falls through to a few Claude calls.

## Known issues + caveats

- **Llama 3.3 70B ≠ Claude Sonnet 4.6** on structured output and tool calling.
  The hardened eval will surface regressions loudly. Read the per-provider
  `EVAL.md` sections (once they exist) before promoting a provider to
  deployed-primary.
- **Cerebras free tier daily ceiling** — a bursty demo can hit the wall.
  Mitigated by the OpenRouter fallback.
- **Free-tier ToS — some providers train on submitted traffic.** Read each
  provider's terms before pointing the deployed demo at it.
- **Application alignment** — the cover letter at
  `gemini/witus/plans/ecosystem/langchain/langchain-application-kit.md` cites
  *"100% on the 25-fixture acceptance set"*. That number is from the Claude
  Sonnet 4.6 baseline run, which stays committed in `EVAL.md`. The README
  already names the model.

## Stop conditions met or not?

Per `plans/self-hosted-langchain/03-claude-code-handoff.md` Step 8 — stop
conditions:

- **No existing test failed.** Vitest reports 32 passed, 5 skipped — same
  shape as pre-migration.
- **No eval regression yet measured** (eval re-run is blocked on task 08).
- **No tool-call output format divergence yet measured.** Will surface on
  first non-Claude/non-Gemini eval run.
- **LangSmith traces** unchanged (tracing layer is provider-agnostic).
- **Every call site that called `buildChatModel`** has been migrated to
  `buildChatModelWithFallback`. The factory itself is the only file that
  still calls `buildChatModel` directly (it has to — it's the factory).

Branch pushed, not merged. BAM merges after review.

## Follow-up (out of scope of this branch)

- `centenarian-coach-multiagent` — same shape, fanning the pattern out.
- `wanderlearn-field-reporter` — bigger change because it has no `/admin`
  dashboard yet.
- `plans/self-hosted-langchain/02-blog-post-draft.md` — the blog post draft
  has `[METRIC: ...]` placeholders this migration's eval re-runs will fill.
