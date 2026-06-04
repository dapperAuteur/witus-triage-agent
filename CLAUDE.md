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

The site **brandanthonymcdonald.com** (BAM's personal portfolio) lives in
`/Users/bam/Code_NOiCloud/ai-builds/claude/bam-landing-page/` — **NOT** `bam-portfolio`.
A stray directory at `/Users/bam/Code_NOiCloud/projects/bam-portfolio/` exists from a prior
misplaced `Write` call; it is not a real repo. When asked to work on the
brandanthonymcdonald.com codebase, target `bam-landing-page`.

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

## Operator-task rule

Anytime work requires BAM to do something **outside the editor** — API key generation,
secret generation, env-var setup, DNS, vendor dashboard configuration, PR review/merge —
create a task file under `./plans/user-tasks/`. No exceptions for "small" steps. The
index `./plans/user-tasks/00-descriptions.md` is the queue BAM scans at session start;
its table uses the columns `# | Title | Scope | Blocks | Status`, and every row's
**Blocks** cell names the downstream work it unblocks. Ecosystem-wide tasks (Keap, IRL
events, cross-product decisions) go in the canonical witus queue at
`gemini/witus/plans/user-tasks/`; repo-local tasks stay here. Full rule:
`gemini/witus/CLAUDE.md`.

---

## Branch-hygiene rule

In force across every ecosystem repo. **Half 1** — Claude branches → commits → pushes →
stops; BAM merges. Never `git checkout main && git merge`, never `git push --force`.
Re-run `git branch --show-current` before *every* commit (not just at branch creation).
**Half 2** — BAM merges pushed branches between sessions; assume prior branches are
already merged into `main` at session start, and watch for the silent fast-forward trap
mid-session. **Half 3** — one concern per branch; at handoff, consolidate small branches
into one `bundle/<slug>-YYYY-MM-DD` branch with `git merge --no-ff` (never squash), run
`tsc + lint + build` on the bundle, push it, and file one `plans/user-tasks/` merge task.
Full rule: `gemini/witus/CLAUDE.md`.

---

## Citation rule

The `docs/lessons/` curriculum is **teachable content** — it uses **APA 7 in-line
citations** (`(Author, Year)`) with a `## References` section per file, alphabetized,
hanging-indent. The rule covers all curriculum / professional / business writing
ecosystem-wide. It does **not** apply to code comments, READMEs, `ARCHITECTURE.md`,
`plans/user-tasks/*`, or engineering notes. Full rule: `gemini/witus/CLAUDE.md`.

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

## Plans convention

All implementation plans live in `./plans/` as markdown named `NN-description-of-plan.md` — two-digit numeric prefix, kebab-case slug, next available number, don't skip. Sub-queues: `./plans/user-tasks/NN-slug.md` (operator tasks), `./plans/bugs/`, `./plans/future/`. (`plans/` is typically gitignored — local working notes.) Full rule: `gemini/witus/CLAUDE.md` §"Plans convention".
