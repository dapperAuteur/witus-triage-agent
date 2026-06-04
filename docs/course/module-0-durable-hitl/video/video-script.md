# Video script & production guide — *Quickstart: Durable HITL Interrupts with Postgres Checkpointer*

**Format (per PRD §4.2):** voice-led screencast of the notebook, bookended by a
30-second on-camera intro and a 30-second on-camera outro. **No** per-module
intro videos (that's a Project/Foundation convention).
**Runtime:** ~20 min raw → **~10 min edited**.
**Deliverable:** one MP4 (1080p, then a 720p fallback), `.srt` captions, chapter
markers, hosted on the course's video host with the embed dropped into the
`bam-landing-page` `/learn/quickstart-durable-hitl` page when the course flips
🟡 → 🟢.

> ⚠️ **STOP gate (PRD §11 / kickoff):** the recording stack is set up but **no
> recording happens until BAM approves.** Hardware/host purchases are operator
> tasks — see `plans/user-tasks/` (`10` recording stack, `11` video host,
> `12` Postgres demo env). This document is the script + plan to approve.

Document order, per request: **(1) Production specs → (2) Pre-production →
(3) The script (with on-camera intro/outro) → (4) Post-production → (5) Screen-
recording descriptions (LAST).**

---

## 1. Production specs

| Spec | Value |
|---|---|
| Edited runtime | ~10:00 (hard cap 11:00 — Quickstart discipline) |
| Aspect / resolution | 16:9, 1920×1080 @ 30fps (export 720p fallback) |
| Screen capture | 2560×1440 logical canvas, captured region cropped to the notebook column |
| Audio | Mono voice, −16 LUFS integrated, −1 dBTP ceiling, noise-gated |
| On-camera | 30s intro + 30s outro only; webcam 1080p, eye-level, soft key light |
| Brand | WitUS Inbox **violet-on-slate** identity — lower-thirds + end card per `docs/STYLEGUIDE.md`. Logo variant `04-orbit-type`. |
| Captions | Burned-in OFF; sidecar `.srt` ON (accessibility) |
| Chapters | 4 (one per lesson) + intro + outro |

---

## 2. Pre-production

### 2.1 Recording stack (set up, then PAUSE for approval)
- **Screen + audio capture:** OBS Studio (free) *or* ScreenFlow (paid, Mac) —
  see operator task `10`. OBS recommended for the cross-platform crash-test
  demo; ScreenFlow if BAM wants a faster edit timeline.
- **Mic:** any cardioid USB condenser (operator task `10` lists options).
- **Webcam:** built-in 1080p is fine for the 30s bookends.
- **Editor:** DaVinci Resolve (free) — chapters, captions, end card.

### 2.2 Environment prep (the demo must be deterministic)
- [ ] Clean Python 3.11 venv: `pip install -r requirements.txt`.
- [ ] **Postgres up and EMPTY:** `docker compose down -v && docker compose up -d --wait`
      so the `checkpoints` table starts empty (the Lesson 2 SQL count reads clean).
- [ ] `.env` with a **dedicated** `LANGSMITH_PROJECT=quickstart-durable-hitl-demo`
      so the Lesson 4 run list isn't polluted by prior runs.
- [ ] Run the whole notebook ONCE off-camera to warm caches and confirm green.
      Then **restart the kernel** and `docker compose down -v && up` for the take,
      so on-camera execution starts from zero.
- [ ] Editor font ≥ 16pt, high-contrast theme, hide bookmarks bar, full-screen
      the browser. Cursor highlight ON.
- [ ] Pre-stage two terminal panes only if needed; otherwise run everything from
      notebook cells so the viewer sees one surface.

### 2.3 Script discipline
- Narration is **action-first**: say what we're about to make the surface do, do
  it, name the result. No motivation essays, no "why HITL matters" — the crash
  *is* the motivation.
- Every lesson's voiceover restates the scope cut in one breath ("we're not
  covering X here").

---

## 3. The script

Timecodes are the **edited** cut. `[V]` = voiceover, `[CAM]` = on-camera,
`[SCR]` = on-screen action (full capture detail in §5).

---

### 0:00–0:30 — On-camera INTRO  `[CAM]`
*Lower-third (violet-on-slate): "Durable HITL Interrupts · LangGraph + Postgres".*

> "Your human-in-the-loop agent pauses for approval, the worker restarts — and
> the paused request is just… gone. In the next ten minutes I'll show you that
> failure happening live, then fix it with about ten lines and a Postgres
> checkpointer. Python, one notebook, one `docker compose up`. Let's break it
> first."

*Cut to screen. Title card (violet-on-slate, 1.5s): the course title + "What this
is NOT: no TypeScript, no alt checkpointers, no eval, no auth — durability only."*

---

### 0:30–2:30 — Lesson 1: The crash test  `[V]` + `[SCR]`  *(Chapter: "The crash test")*

> "One surface this whole course — LangGraph's interrupt paired with the Postgres
> checkpointer. Lesson 1, we're not covering *why* you'd use human-in-the-loop;
> we're proving the default loses state on a restart."

`[SCR]` Scroll to the `triage_graph.py` cell; run it.

> "Here's a four-node triage graph — intake, propose, human-approval, finalize.
> The approval node calls `interrupt()`. That's the pause. I'm writing it to a
> file so two *separate* processes can import it — because this is going to be a
> real restart, not a fake one."

`[SCR]` Run the two `%%writefile` cells (`step1`, `step2`).

> "Process one runs the graph until it pauses, then exits — that exit is the
> crash. Process two is a brand-new Python process that tries to resume the same
> thread. Default checkpointer: `MemorySaver`. Watch process two."

`[SCR]` Run `!python step1_interrupt.py memory crash-test-mem` → run
`!python step2_resume.py memory crash-test-mem`.

> "'STATE LOST — no checkpoint for thread.' `MemorySaver` keeps everything in the
> first process's heap. That process is dead, so the paused approval died with
> it. That's the gap no HITL tutorial shows you. Let's close it."

---

### 2:30–5:30 — Lesson 2: Swap to the Postgres checkpointer  `[V]` + `[SCR]`  *(Chapter: "The 10-line fix")*

> "Lesson 2 — and we're staying local: docker-compose Postgres, no cloud, no
> production hardening. The *only* thing changing is the checkpointer."

`[SCR]` Scroll to the swap markdown; highlight the 6-line `PostgresSaver` block.

> "That's the whole fix. A connection pool, `PostgresSaver`, call `setup()` once
> to create the tables, compile the *same* graph with it."

`[SCR]` Run the `make_checkpointer("postgres")` cell → "tables created".

> "Now the exact same crash test — same two processes — but `postgres` this time."

`[SCR]` Run `!python step1_interrupt.py postgres durable-demo-1` → run
`!python step2_resume.py postgres durable-demo-1`.

> "'Resumed across the crash — EXECUTED.' A brand-new process picked up a thread
> that paused inside a process that no longer exists. Because the checkpoint
> isn't in memory anymore —"

`[SCR]` Run the `SELECT thread_id, count(*) FROM checkpoints` cell.

> "— it's sitting right here in Postgres. That's the surface working."

---

### 5:30–8:00 — Lesson 3: Durable interrupt patterns  `[V]` + `[SCR]`  *(Chapter: "Two rules")*

> "Lesson 3 — two rules that decide whether *your* interrupt survives. Not a
> tools tour, not state-design theory — just the durability contract."

`[SCR]` Run the `get_state` / `get_state_history` cell.

> "Rule one: only what's in graph *state* is durable. `category` and
> `proposed_action` were set before the pause, so they're in the checkpoint and
> the resumed process has them. A local variable wouldn't be. If you need it on
> resume, return it into state."

`[SCR]` Run the `side_effects` re-run demo cell; let the output land on
"it ran TWICE".

> "Rule two: the node with `interrupt()` re-runs from its first line on resume.
> Here a side effect *before* the interrupt fires twice from one approval. The
> production triage agent's rule is blunt about it —"

`[SCR]` Scroll to the quoted `humanApproval.ts` block.

> "— do nothing non-idempotent before the interrupt. Charge the card, send the
> email, in the node *after* the gate, where it runs exactly once."

---

### 8:00–9:30 — Lesson 4: Verify in LangSmith  `[V]` + `[SCR]`  *(Chapter: "See it in the trace")*

> "Last lesson — see the survival in the trace. Not a tracing tutorial, not eval;
> just find the runs and confirm the resume continued the same thread."

`[SCR]` Run the LangSmith "find your run" cell; click a printed run URL → browser.

> "The run that paused and the run that resumed share one `thread_id`. Filter the
> project by `durable-demo-1` —"

`[SCR]` In LangSmith UI: filter by thread, open the resumed run, expand the tree.

> "— and the resumed run starts from the persisted checkpoint, at
> human-approval into finalize. Not from scratch. The interrupt survived a
> restart, and the trace proves it."

---

### 9:30–10:00 — On-camera OUTRO  `[CAM]`
*End card (violet-on-slate): repo URL + "migration-checklist.md" + the three
sibling course names.*

> "State loss, fixed with a checkpointer swap, with the two rules that keep your
> own agent durable. The repo has a migration checklist to point this at your
> agent today. That's the Quickstart — go make your interrupts survive."

---

## 4. Post-production

- **Cut:** trim dead air between cell runs to ~0.5s; keep the *full* pause on the
  "STATE LOST" and "resumed across the crash" outputs (1.5–2s hold each — those
  two beats are the whole course).
- **Zoom/pan:** punch-in on (a) the `interrupt()` line, (b) the 6-line Postgres
  swap, (c) "STATE LOST", (d) "resumed across the crash", (e) the `humanApproval.ts`
  quote. See §5 for exact regions.
- **Lower-thirds:** intro title only; per-lesson chapter titles as 1.2s wipes in
  violet-on-slate.
- **Captions:** auto-generate, hand-correct the technical terms (`interrupt`,
  `PostgresSaver`, `MemorySaver`, `thread_id`, `checkpointer`). Export `.srt`.
- **Chapters:** Intro 0:00 · Crash test 0:30 · The 10-line fix 2:30 · Two rules
  5:30 · See it in the trace 8:00 · Outro 9:30.
- **Loudness:** normalize voice to −16 LUFS; no music bed under narration (a 2s
  violet-on-slate sting under the intro/outro cards is fine).
- **Export:** H.264 MP4, 1080p ~8 Mbps + 720p ~4 Mbps fallback. Filename
  `durable-hitl-quickstart_v1.mp4`.
- **QA pass:** watch once at 1× confirming every on-screen command matches the
  voiceover, and the two "money" outputs are legible at 720p.

---

## 5. Screen-recording descriptions (shot-by-shot capture spec)

Capture the **notebook column only** (crop out the Jupyter sidebar). Cursor
highlight ON. Each shot below is one continuous capture; edit points are in §4.

### SR-0 · Setup state (pre-roll, not in final cut)
- Browser full-screen, notebook open at the title cell, kernel freshly
  restarted, `docker compose` freshly `down -v && up`. Confirm the title cell's
  scope-NOT list is visible. *Not narrated — used only to verify a clean start.*

### SR-1 · Lesson 1, the graph (0:30–1:15)
- **On screen:** the `%%writefile triage_graph.py` cell.
- **Action:** click the cell, run it (Shift+Enter), let "Writing triage_graph.py"
  appear. Slowly scroll the cell so the `human_approval` function and its
  `interrupt(...)` call are centered.
- **Zoom for edit:** punch-in 1.4× on the `interrupt({...})` call for ~2s.

### SR-2 · Lesson 1, write the two processes (1:15–1:40)
- **On screen:** the `step1_interrupt.py` and `step2_resume.py` `%%writefile`
  cells.
- **Action:** run both; let both "Writing …" confirmations appear. Briefly
  highlight the line in `step2` that prints "STATE LOST".

### SR-3 · Lesson 1, the crash (1:40–2:30)  ★ money shot
- **On screen:** the two `!python … memory …` cells, run back-to-back.
- **Action:** run `step1` (output: "paused at node… process exiting now — this
  is the crash"), then `step2`.
- **Hold:** freeze 2s on the red **"X STATE LOST — no checkpoint for thread
  'crash-test-mem'"** output. Punch-in 1.5× on those two lines.

### SR-4 · Lesson 2, the swap (2:30–3:20)
- **On screen:** the Lesson 2 markdown with the 6-line `PostgresSaver` block.
- **Action:** cursor-drag-select the 6 swap lines to draw the eye. Then run the
  `make_checkpointer("postgres")` cell; land on "tables created".
- **Zoom for edit:** punch-in 1.3× on the 6-line block for ~3s while narrating.

### SR-5 · Lesson 2, the durable rerun (3:20–4:40)  ★ money shot
- **On screen:** the two `!python … postgres durable-demo-1` cells.
- **Action:** run `step1` (pauses, "process exiting now"), then `step2`.
- **Hold:** freeze 2s on the green **"OK resumed across the crash → EXECUTED:
  …"** line. Punch-in 1.5×.

### SR-6 · Lesson 2, proof in the DB (4:40–5:30)  ☆ BONUS (optional — see §6)
- **On screen:** the `SELECT thread_id, count(*) FROM checkpoints` cell output.
- **Action:** run it; the `durable-demo-1` row with its checkpoint count appears.
  Cursor-underline the `durable-demo-1` row.

### SR-7 · Lesson 3, what's persisted (5:30–6:30)
- **On screen:** the `get_state` / `get_state_history` output.
- **Action:** run the cell. Slowly scroll the "checkpoint lineage" list so each
  `next=… channels=[…]` line is readable.
- **Zoom:** punch-in on `durable state channels : {'submission':…, 'category':…,
  'proposed_action':…}`.

### SR-8 · Lesson 3, the re-run hazard (6:30–7:20)  ★ teaching beat
- **On screen:** the `side_effects` demo cell.
- **Action:** run it. **Hold 2s** on the two-line output ending
  `after resume, side_effects = ['ran', 'ran'] <- it ran TWICE`. Punch-in 1.4×.

### SR-9 · Lesson 3, the production rule (7:20–8:00)
- **On screen:** the quoted `humanApproval.ts` block in the markdown cell.
- **Action:** scroll so the full blockquote is centered; cursor-trace the
  "no DB writes, no non-idempotent work before the interrupt" line.

### SR-10 · Lesson 4, find the run (8:00–8:40)  ☆ BONUS (optional — see §6)
- **On screen:** the LangSmith "find your run" cell output (the printed run list
  with `thread=` + URLs).
- **Action:** run it; hover a `durable-demo-1` run URL, click it (opens browser
  tab).

### SR-11 · Lesson 4, the trace UI (8:40–9:30)  ★ payoff · ☆ BONUS (optional — see §6)
- **On screen:** LangSmith project view in the browser.
- **Action:** type `durable-demo-1` into the thread/metadata filter; open the
  **resumed** run; expand the run tree to show `human_approval → finalize` (NOT
  starting at `intake`). Cursor-circle the entry node.
- **Note:** if the live UI differs at record time, capture whatever shows the two
  runs sharing the thread and the resume starting mid-graph — that's the claim.

### SR-12 · Outro end card (9:30–10:00)
- Not a screen recording — DaVinci end card (violet-on-slate) with the repo URL,
  `migration-checklist.md`, and the three sibling course names. Hold to 10:00.

---

## 6. Bonus footage (optional segments)

These shots cover the notebook's **optional steps** (tagged ☆ above and marked
"(Optional — bonus footage)" in the notebook itself). **Film all of them**, but
treat them as *bonus footage*: the ~10-minute core cut is complete without them,
and any one can be dropped to hit the runtime cap or if a dependency (a LangSmith
key, an LLM key) isn't configured at record time. Capture them in this order so a
single take yields both the core cut and the bonus reel.

| Bonus shot | Covers notebook optional step | Drop it if… | If kept, where it slots |
|---|---|---|---|
| **SR-6** — checkpoint rows in Postgres | #2 "peek at the checkpoint rows" | runtime is tight | extends Lesson 2 by ~30s after the durable rerun |
| **SR-10 + SR-11** — LangSmith find-the-run + trace UI | #1 "LangSmith verification (Lesson 4)" | no `LANGSMITH_API_KEY` configured | the whole of Lesson 4 (8:00–9:30) |
| **NEW: SR-13** — real-LLM swap | #3 "swap in a real LLM node" | no model API key, or runtime is tight | a 30–45s tag after Lesson 3, before the outro |

### SR-13 · Bonus, the real-LLM swap (optional, ~40s)
- **On screen:** the end-of-notebook **commented-out** "OPTIONAL / BONUS STEP #3"
  cell.
- **Action:** scroll to the cell; cursor-trace the commented `propose_with_llm`
  function. *Optionally* (only if `ANTHROPIC_API_KEY` is set and you've installed
  `langchain-anthropic`) uncomment it, swap it into the graph, and rerun the
  Lesson 2 crash test to show the model-written proposal surviving the restart.
- **Voiceover (bonus):** "Durability never cared about the model — here's a real
  Claude node writing the proposal, and the exact same crash test still resumes
  it. The checkpointer doesn't know or care that a model is in the loop."
- **Note:** if you don't enable it, just narrate over the commented cell — the
  point (durability is model-independent) lands either way.

**Editing the bonus reel:** keep the core 10-min cut as `…_v1.mp4`. Assemble the
kept bonus shots into the timeline at the slots above for a `…_v1-extended.mp4`,
and/or export them standalone as `bonus-*.mp4` for the course page. Chapters for
any kept bonus segment: "Bonus · checkpoint rows", "Bonus · real-LLM swap"
(Lesson 4 already has its own chapter).

---

*Branding note:* all titles, lower-thirds, and the end card use the WitUS Inbox
violet-on-slate identity and logo variant `04-orbit-type` per
[`docs/STYLEGUIDE.md`](../../../STYLEGUIDE.md). If a Rise Wellness callout
appears anywhere in the end card, the disclaimer text is **byte-identical** to
the brand package — never paraphrased.
