@AGENTS.md

# WitUS Triage Agent

A LangGraph agent that classifies incoming **WitUS Inbox** submissions, enriches them,
proposes an action, and routes through a human-in-the-loop approval gate before executing
anything irreversible. It is **shared infrastructure** in the WitUS ecosystem, sibling to
WitUS Inbox (`claude/witus-inbox`) and WitUS Outbox.

This repo is also a **portfolio piece** for LangChain hiring managers — the LangGraph
patterns (graph state, tools, HITL interrupts) and the `docs/lessons/` curriculum are
meant to be read by outside engineers. Keep the code legible.

---

## ⚠️ Ecosystem repo identity (don't confuse these)

This repo (`witus-triage-agent`, under `claude/lang-chain/`) is **not** WitUS Inbox
(`claude/witus-inbox`) and **not** the parent WitUS site (`gemini/witus`). It is the
triage agent that operates *on* Inbox submissions. Don't build Inbox features here — the
Inbox owns submission ingestion, reply threads, and the operator inbox UI; this repo only
classifies, proposes, and (post-approval) executes.

---

## Branding — read before any UI change

Ecosystem branding is canonical at `gemini/witus/public/brand/` (README + footer-recipe).
This product follows the **WitUS Inbox** visual identity: **violet accent on slate**,
light + dark. Logo variant `04-orbit-type`. The ecosystem footer (with the verbatim Rise
Wellness callout) and the favicons are copied from the brand package — see
`docs/STYLEGUIDE.md` in this repo for the resolved tokens and rules. The Rise Wellness
non-affiliation disclaimer must stay **byte-identical** — never paraphrase it.

The WitUS menu (`SiteHeader`) and ecosystem footer (`SiteFooter`) must appear on **every**
page, rendered once from the root layout (`app/layout.tsx`) — never per-route. The menu is
auth-aware (minimal signed out, full dashboard nav for the operator) and collapses to a
hamburger on mobile. User-facing help lives at `/help` (`app/help/page.tsx`), mirrored in
`docs/operator-guide/`.

---

## Project specifics

- **Stack:** Next.js 16 (app router, root `app/`), TypeScript strict, `@langchain/langgraph`,
  Drizzle ORM on node-postgres (`pg`), NextAuth v4, Tailwind v4, Vitest.
- **LLM:** dual-provider via `agent/model.ts`. **Gemini 2.5 Flash** (`@langchain/google-genai`,
  `GEMINI_API_KEY`) for testing; **Claude Sonnet 4.6** (`@langchain/anthropic`,
  `ANTHROPIC_API_KEY`, model id `claude-sonnet-4-6`) for production/launch. Provider is
  auto-detected from the keys, or forced with `TRIAGE_LLM_PROVIDER`.
- **DB:** this repo owns its **own** Neon/Postgres instance — per the ecosystem rule,
  databases are never shared across apps. It mirrors the Inbox `submission` table so it
  can run standalone on a fresh local Postgres; submissions arrive via the signed webhook
  to `/api/triage/start` (full payload, not just an id).
- **Build plan:** `plans/PRD-1-witus-triage-agent.md` (the PRD) and
  `/Users/bam/.claude/plans/please-review-the-prd-whimsical-patterson.md` (the approved
  implementation plan).
- **Agent nodes are pure functions of state** — side effects only in `execute` and
  `log_rejection`. Every tool has a Zod input schema. LangSmith tracing is on by default
  but the app must still run if `LANGSMITH_API_KEY` is missing (fail soft).
- **Shipped UI:** the operator dashboard (`/triage`, `/triage/[id]`, `/triage/history`,
  `/triage/waitlist`, `/admin`), the offline service worker, and the public operator help
  (`/help` + `docs/operator-guide/`) are all live. Menu + ecosystem footer render on every
  page from the root layout — see the Branding section. When app behavior changes, keep
  `/help`, `docs/operator-guide/`, and the README "For operators" section current.

---

<!-- BEGIN:witus-shared-rules v1 -->
<!-- MANAGED BLOCK — do not edit by hand. Source: gemini/witus/docs/shared-rules.md.
     Update the source, then run `node scripts/sync-claude-rules.mjs` in the witus repo. -->

## ⚠️ Ecosystem identity (shared note — don't confuse repos)

Full ecosystem identity + the canonical product index live in `gemini/witus/CLAUDE.md` and
`gemini/witus/lib/products.ts`. Each repo states *which* product it is in its own hand-owned line
above this managed block; don't infer another app's URLs, routes, IDs, env names, or DB schema —
confirm against that app's own code.

The site **brandanthonymcdonald.com** (BAM's personal portfolio) lives in `claude/bam-landing-page/`
— **NOT** `projects/bam-portfolio/` (the retired legacy static site). Target `bam-landing-page`.

## Operator-task rule — capture user actions in `./plans/user-tasks/`

When Claude proposes work that needs BAM to do something outside the editor (account signup, API
key, DNS change, vendor dashboard, env-var rotation, secret generation, PR review/merge, etc.),
Claude MUST create a `./plans/user-tasks/NN-slug.md` file in this repo. **No exceptions for "small"
steps.** Required sections: **Scope tag** · **What + why** (with explicit *what this blocks* detail
and any hard deadline) · **Steps** · **What Claude will use** · **How to mark done** · **Related**.
Keep `./plans/user-tasks/00-descriptions.md` updated with columns `# | Title | Scope | Blocks |
Status` — the `Blocks` column is the one BAM scans. Ecosystem-wide tasks (Keap, IRL events, retros,
cross-product decisions) live in the canonical witus queue at `gemini/witus/plans/user-tasks/`;
repo-local tasks live here. Read the witus queue at session start before dependent work. Full rule:
`gemini/witus/CLAUDE.md` §"Operator-task rule".

## Branch hygiene — BAM merges, between sessions by default

**Half 1.** Branch → commit → push → stop. Claude does not run `git checkout main && git merge`.
Never `--force` to shared branches. Before every commit run `git branch --show-current`; if it is
`main`/`master`, branch first (`feat/ fix/ chore/ docs/`). After push, hand back the branch name +
summary and stop.

**Half 2.** BAM merges pushed branches via the GitHub UI between sessions. Mid-session, after a
push, BAM may merge in a separate window and the local checkout silently fast-forwards to `main` —
so re-check `git branch --show-current` before **every** commit, not just at branch creation, or you
risk landing follow-up commits directly on `main`.

**Half 3.** Keep branches small (one concern each). When a session produces multiple branches,
consolidate them into one `bundle/<slug>-YYYY-MM-DD` via `git merge --no-ff` (preserves per-concern
history — no squash), resolve conflicts during bundling, run `tsc + lint + build` against the
bundle, push, and file ONE `./plans/user-tasks/NN-merge-bundle-<slug>.md`. BAM does one merge, not N.

**Commit often.** Commit at every working checkpoint — a passing build, a finished sub-step, a green
test — not just at the end. A usage-limit cutoff, a dropped connection, or a crashed session must
never lose more than the last few minutes of work. Small frequent commits on the feature branch keep
the branch un-merged (Half 1 still holds) and give BAM clean per-step history to drill into.

A checked-in `.githooks/pre-commit` guard refuses commits made directly on `main`/`master`. Activate
once per clone: `git config core.hooksPath .githooks`. Full rule: `gemini/witus/CLAUDE.md`
§"Branch-hygiene rule".

## Docs-sync rule — a change isn't done until its docs are current

When a change adds, alters, or removes a user-visible feature/route/scope, update the affected docs
**in the same branch**: README (feature list, env examples, scripts), in-app help/tutorial content,
`ROADMAP.md` **and** any public roadmap page, API/OpenAPI docs, and STYLE_GUIDE/CONTRIBUTING when a
convention changed. State which docs you touched in the handoff. Never leave an aspirational ✅ on a
roadmap — downgrade it with a one-line reason. If a doc update is genuinely out of scope, file it as
a `./plans/` task rather than skipping silently. A Stop hook in `.claude/settings.json` gates on
this: if the session diff changed feature/route files but touched no docs, it blocks once and asks
you to update-or-defer. Schema-only migrations, refactors, perf, and dev-tooling changes don't
trigger it.

## Plans convention

All implementation plans live in `./plans/` as `NN-description-of-plan.md` (two-digit prefix,
kebab-case, next available number, don't skip). Sub-queues: `./plans/user-tasks/NN-slug.md`
(operator tasks), `./plans/bugs/`, `./plans/future/`. (`plans/` is typically gitignored.)

## Citation rule

Anything publishable, teachable, or partner-facing (curriculum, teaching-oriented help articles,
white papers, grant/sponsor/partner writing) uses APA 7 in-line citations with a `## References`
section. Code docs, internal notes, and `plans/user-tasks/*` are out of scope. Full rule:
`gemini/witus/CLAUDE.md` §"Citation rule".

## Authoritative-values rule — never assert guessed external values

When a value is owned by an external system (DNS/registrar, a host like Vercel, a third-party API,
or another ecosystem app's URLs/routes/IDs/env/schema), read it from the authoritative source; don't
hardcode a guessed default and present it as correct. If you must ship a fallback, label it as a
fallback in both UI copy and a code comment. Verify by behavior (does the flow work?), not by
exact-match against a guess. When unsure, flag or ask — never assert. Full rule:
`gemini/witus/CLAUDE.md` §"Authoritative-values rule".

## Coding conventions

UI/UX/DX conventions (a11y, component patterns, TypeScript, microcopy, git-commit vocabulary, the
default Neon+Drizzle+pnpm+Vitest stack) are consolidated in `gemini/witus/docs/shared-ui-ux-dx.md`.
Read it before writing UI or API code. Two repos are grandfathered on Supabase+Jest and documented
there as exceptions.

<!-- END:witus-shared-rules v1 -->
