# MIGRATION_NOTES — Quickstart: Durable HITL Interrupts with Postgres Checkpointer

> **Deviation flagged:** the kickoff asked for `MIGRATION_NOTES.md` at repo root,
> but repo root already holds a 7.5 KB `MIGRATION_NOTES.md` for the triage agent's
> prior work. Overwriting it would destroy unrelated content, so these notes live
> in the course directory instead. (Surfaced per the "look before you overwrite"
> rule.)

Branch: `feat/langchain-academy-quickstart` · Date: 2026-06-02

---

## 1. Files changed (paths only)

**Course (new, self-contained, MIT — the forkable exit artifact).** Organized as
a single module under `docs/course/`, mirroring the `centenarian-coach-multiagent`
`docs/course/module-N-<slug>/` convention. One notebook = one module (the
one-notebook/one-video Quickstart discipline forbids splitting into per-lesson
modules), so all content lives in `docs/course/module-0-durable-hitl/`:
- `docs/course/module-0-durable-hitl/durable-hitl-quickstart.ipynb` — the one notebook, 4 lessons, 31 cells (incl. an optional-steps roadmap + a commented-out real-LLM bonus cell)
- `docs/course/module-0-durable-hitl/README.md` — scope statement + outline + APA-7 refs
- `docs/course/module-0-durable-hitl/docker-compose.yml` — local Postgres
- `docs/course/module-0-durable-hitl/requirements.txt` — pinned Python SDKs
- `docs/course/module-0-durable-hitl/migration-checklist.md` — the durable take-home
- `docs/course/module-0-durable-hitl/video/video-script.md` — full script + pre/post production + screen-recording shot list (co-located in the module's `video/` subdir)
- `docs/course/module-0-durable-hitl/.env.example` — env template (no LLM key by design)
- `docs/course/module-0-durable-hitl/.gitignore` — keeps notebook the single source of truth

**Repo infra (new):**
- `.github/workflows/quickstart-durable-hitl-smoke.yml` — CI smoke test (PRD §8.6)

**Operator queue (local-only, `plans/` gitignored):**
- `plans/user-tasks/09…`, `10…`, `11…`, `12…` + updated `00-descriptions.md`

The PRD's "should be one notebook + README + docker-compose" ideal is met at the
core; the extra files are the take-home, the CI guard, and the production script
the build explicitly requested — each is additive, none is a second lesson track.

The existing `docs/lessons/0[1-4]-*.md` Project-tier triage material was **not
touched** (PRD §3.2 / kickoff) — its existence is what this Quickstart's scope
statement points *out of*.

---

## 2. Rubric self-scoring (PRD §3 · 1–5 each)

| # | Criterion | Score | One-line evidence |
|---|---|:--:|---|
| Q1 | Single surface, no detours | **5** | Tours only `PostgresSaver` + `interrupt()`; alternatives are out-of-scope, not surveyed; every lesson ends with the surface visibly acting (crash output → resume output → DB rows → re-run demo → trace). |
| Q2 | Total time < 1 hr | **5** | 4 lessons / ~35 min read-budget, and the surface is **proven working by Lesson 2** — the notebook now executes end-to-end green (0 cell errors) against a real Postgres, with the durable cross-process resume landing in Lesson 2 (see §3). Human read-through timer still recommended (§8.3) but no longer a risk. |
| Q3 | Setup-and-run up front | **5** | Setup is step-0; Lesson 1 *ends* with the live two-process crash output; the crash-test scripts are copy-paste-able into a learner's own project. |
| Q4 | Action-first, benefit-led | **5** | The crash *is* the motivation — no "why HITL matters" essay, no decision framework; each lesson ends with a concrete output the learner can show someone. |
| Q5 | Explicitly scoped | **5** | README opens with the full "will NOT cover" list; every lesson restates a tighter cut and Lesson 4 points to the Foundation + Project sibling courses by name. |

**Result:** every criterion at **5/5** → **Exceeding** (PRD §3 bar: every ≥ 4,
≥ 3 at 5). Q2 moved 4 → 5 once the notebook was executed end-to-end against a
real Postgres (§3) — the only prior gap was the un-run notebook, now closed.

### Deal-breaker check (PRD §3.1) — all clear
- 4 lessons, **not** padded to 6. ✅
- One notebook, one docker-compose, **Python only**; no TS track, no eval datasets. ✅
- Surface visible in **Lesson 1** (the crash test demonstrates state loss live, in two real processes). ✅
- Scope statement at the **top of the README** and at the **start of every lesson**. ✅

---

## 3. Wall-clock time-to-finish (test-reader)

**Executed end-to-end — green.** The notebook was run top-to-bottom via
`jupyter nbconvert --execute` against a **real local Postgres 16-equivalent
(UTF8) on the pinned SDKs** (`langgraph==0.6.7`, `langgraph-checkpoint-postgres==2.0.21`,
`psycopg==3.2.3`). Result: **0 cell errors**, ~17s machine execution. Every
pedagogical beat fired:

- Lesson 1 (memory): `STATE LOST — no checkpoint for thread 'crash-test-mem'`.
- Lesson 2 (postgres): `OK resumed across the crash → EXECUTED …` — a fresh OS
  process resumed a thread paused inside an exited one.
- Lesson 2 DB proof: `durable-demo-1  6 checkpoints`.
- Lesson 3 lineage: `__start__ → intake → propose → human_approval`; idempotency
  demo prints `side_effects = ['ran', 'ran'] … ran TWICE`.
- Lesson 4: skips cleanly (no key); bonus cell prints.

**Bug found & fixed during this run:** the Lesson 2 DB-proof cell crashed with
`TypeError: unsupported format string passed to bytes.__format__` on a
**SQL_ASCII** test cluster (psycopg returns text as `bytes` on non-UTF8 DBs). The
course's targets (docker-compose `postgres:16`, Postgres.app) are UTF8, so this
never hits the happy path — but the cell now defensively `.decode()`s, so it's
bulletproof for forkers who point at any database. Re-ran after the fix: still
green, clean `str` output.

*Caveat:* this is **machine** execution (proves correctness + that the surface
works by Lesson 2). The **human** read-through timer (PRD §8.3, target 30–45 min)
is still a nice-to-have but is no longer a risk — the technical path is verified.
The `_ci_executed.ipynb` artifact path is `.gitignore`d. A second run with tracing
on also populated LangSmith and confirmed the Lesson 4 claim in a real trace
(see §5).

---

## 4. bam-landing-page PR URL

**Not opened yet (intended).** Per PRD §7 the landing flips 🟡→🟢 only when the
video + final notebook land. The notebook has landed; the video has not (recording
is gated on BAM's approval, PRD §11 STOP). Tracked as operator task **12**; the PR
opens *from* `bam-landing-page` (never this branch).

---

## 5. LangSmith project URL

**Captured.** Re-ran the notebook with the three LangSmith vars
(`LANGSMITH_API_KEY` from the app's `.env.local` / Vercel env, `LANGSMITH_TRACING=true`,
`LANGSMITH_PROJECT=quickstart-durable-hitl` — isolated from the app's own
`witus-triage-agent` project so demo traces don't pollute it).

**Project URL** (org + project IDs redacted — substitute your own LangSmith IDs):
https://smith.langchain.com/o/<your-langsmith-org-id>/projects/p/<your-langsmith-project-id>

**The trace confirms Lesson 4 empirically** — root runs grouped by `thread_id`:
- `durable-demo-1` → **2 runs** (the pause *and* the resume across the crash) ✅
- `crash-test-mem` → **1 run** (memory: only the pause — nothing resumed, state lost) ✅
- `patterns-demo` → 1 · `idempotency-demo` → 2.

The durable thread carries both a pause and a resume sharing one `thread_id`; the
memory thread carries only the pause. That contrast is the whole course, now
visible in a real trace.

**For the public / forkable artifact (PRD §4.3):** the project is private to the
LangSmith org, so the URL above needs auth. To ship a *learner-forkable* link on
the landing page, create a LangSmith **public share link** for the project
(operator step — noted in task 12).

---

## 6. Blocked on operator tasks

| Task | Blocks |
|---|---|
| 09 — local Postgres demo env | ~~Notebook execution~~ **DONE (verified green, §3)** · ~~real LangSmith URL~~ **DONE (captured, §5)**. Still gates only the recording run on BAM's machine. |
| 10 — recording stack | Recording the video (⚠️ STOP for BAM approval before recording) |
| 11 — video host signup | The landing-page embed URL |
| 12 — bam-landing-page 🟡→🟢 PR | The course's public "Live" status (waits on 09/10/11) |

---

## 7. Branch-hygiene status

Per PRD §6 Block 3 Half 1: branched → committed → pushed → **stopping**. BAM
merges. `git branch --show-current` re-checked before the commit. No
`checkout main && merge`, no `--force`. Single concern on a single branch, so no
bundle consolidation needed this session.
