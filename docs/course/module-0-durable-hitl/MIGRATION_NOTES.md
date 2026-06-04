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
| Q2 | Total time < 1 hr | **4** | Design is 4 lessons / ~35 min with the surface *working by Lesson 2's* durable resume; empirical wall-clock timer is **pending task 09** (no Docker in the build env). |
| Q3 | Setup-and-run up front | **5** | Setup is step-0; Lesson 1 *ends* with the live two-process crash output; the crash-test scripts are copy-paste-able into a learner's own project. |
| Q4 | Action-first, benefit-led | **5** | The crash *is* the motivation — no "why HITL matters" essay, no decision framework; each lesson ends with a concrete output the learner can show someone. |
| Q5 | Explicitly scoped | **5** | README opens with the full "will NOT cover" list; every lesson restates a tighter cut and Lesson 4 points to the Foundation + Project sibling courses by name. |

**Result:** every criterion ≥ 4, four at 5 → **Exceeding** (PRD §3 bar: every ≥ 4,
≥ 3 at 5). The single 4 (Q2) is an honesty discount for the un-run empirical
timer, not a design gap.

### Deal-breaker check (PRD §3.1) — all clear
- 4 lessons, **not** padded to 6. ✅
- One notebook, one docker-compose, **Python only**; no TS track, no eval datasets. ✅
- Surface visible in **Lesson 1** (the crash test demonstrates state loss live, in two real processes). ✅
- Scope statement at the **top of the README** and at the **start of every lesson**. ✅

---

## 3. Wall-clock time-to-finish (test-reader)

**Pending — blocked on operator task 09.** The build environment had no Docker
and no installed Python SDKs, so the notebook is **authored, JSON-validated
(31 cells, nbformat 4.5), and Python-syntax-checked (0 errors across all code
cells)**, and CI-guarded — but **not yet executed end-to-end**. The empirical
timer (PRD §8.2) and the test-reader walkthrough (§8.3) run once Docker is
available on the recording machine (task 09); the real number then replaces this
line.

---

## 4. bam-landing-page PR URL

**Not opened yet (intended).** Per PRD §7 the landing flips 🟡→🟢 only when the
video + final notebook land. The notebook has landed; the video has not (recording
is gated on BAM's approval, PRD §11 STOP). Tracked as operator task **12**; the PR
opens *from* `bam-landing-page` (never this branch).

---

## 5. LangSmith project URL

Project name: **`quickstart-durable-hitl`** (set via `LANGSMITH_PROJECT`). The
shareable URL is generated the first time the notebook runs with a
`LANGSMITH_API_KEY` (Lesson 4's "find your run" cell prints it). Pending task 09 /
a keyed run.

---

## 6. Blocked on operator tasks

| Task | Blocks |
|---|---|
| 09 — local Postgres + Docker demo env | The empirical timer/test-reader run; the real LangSmith URL |
| 10 — recording stack | Recording the video (⚠️ STOP for BAM approval before recording) |
| 11 — video host signup | The landing-page embed URL |
| 12 — bam-landing-page 🟡→🟢 PR | The course's public "Live" status (waits on 09/10/11) |

---

## 7. Branch-hygiene status

Per PRD §6 Block 3 Half 1: branched → committed → pushed → **stopping**. BAM
merges. `git branch --show-current` re-checked before the commit. No
`checkout main && merge`, no `--force`. Single concern on a single branch, so no
bundle consolidation needed this session.
