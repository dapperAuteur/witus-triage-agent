# WitUS Triage Agent — Code & Style Guide

The single reference for how code is written and how the UI looks in this repo. Read it
before adding a node, a tool, an API route, or a component. It resolves the WitUS
ecosystem branding (`gemini/witus/public/brand/`) into concrete tokens for this product.

---

## 1. Product identity

The triage agent follows the **WitUS Inbox** visual identity — it is the Inbox's sibling
infrastructure. Inbox's identity in the ecosystem brand package is **violet accent on
slate, light + dark**, logo variant `04-orbit-type`.

| Token | Value | Use |
|---|---|---|
| Brand accent | `violet-600` (light) / `violet-400` (dark) | primary actions, links, focus rings, active states |
| Surface base | `white` (light) / `slate-950` `#020617` (dark) | page background |
| Surface raised | `slate-50` / `slate-900` | cards, panels |
| Border | `slate-200` / `slate-800` | dividers, card borders |
| Text primary | `slate-900` / `slate-50` | body copy |
| Text muted | `slate-500` / `slate-400` | metadata, captions, eyebrows |
| Font | Geist Sans (variable, from `next/font`) | everything; `font-mono` Geist Mono for IDs/JSON |

Status colors (used on badges — run status, classification category, product health):

| Meaning | Token |
|---|---|
| neutral / new / info | `slate` |
| in progress / pending / caution | `amber` |
| success / approved / executed / green | `emerald` |
| error / rejected / failed / red | `red` |
| accent / agent-authored | `violet` |

Dark theme is the default (`color-scheme: dark`, body `#020617`) to match `gemini/witus`
and `witus-inbox`. Every color must work in both themes — pair `light` and `dark:` tokens.

---

## 2. UI/UX principles (non-negotiable)

### Mobile-first

- Author every layout for the smallest screen first, then add `sm:` / `md:` / `lg:`
  enhancements. Never the reverse.
- Tap targets ≥ 44×44px (`min-h-11` or padding equivalent). The Approve/Reject buttons
  especially — BAM sweeps the queue from a phone.
- One-column by default; multi-column only behind a breakpoint.
- No fixed widths; use `max-w-*` + fluid.

### ARIA / accessibility

- Semantic HTML first (`<button>`, `<nav>`, `<main>`, `<section aria-label>`, `<ul>`).
  Reach for ARIA attributes only when no native element fits.
- Every interactive element has a visible focus ring:
  `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500`.
- Color is never the only signal — pair every status color with text or an icon.
- All form inputs have an associated `<label>`; errors use `role="alert"`.
- Contrast meets WCAG 2.1 AA (4.5:1 body text, 3:1 large text / UI).
- Respect `prefers-reduced-motion` (already handled globally in `globals.css`).
- Icons that carry meaning get `aria-label`; decorative icons get `aria-hidden="true"`.
- Links that open new tabs include an `sr-only` " (opens in new tab)".

### Offline-first

- The app ships a service worker + web app manifest (`public/manifest.webmanifest`).
  The app shell, static assets, and the last-viewed `/triage` queue are cached so the
  operator can open the dashboard with no connection.
- Mutations (approve / reject) require connectivity — when offline, the UI disables those
  controls and shows an explicit "offline — reconnect to act" notice rather than failing
  silently. Never queue an approval offline; the approval gate must be deliberate.
- Data fetching degrades gracefully: a cached read is clearly labelled as cached.
- `next/font` (Geist) is self-hosted — no runtime font fetch.

> Shipped: the service worker (`public/sw.js`, registered by
> `components/service-worker-register.tsx`) and the manifest (`public/manifest.webmanifest`)
> are live. This section is the contract they uphold.

---

## 3. Code conventions

### TypeScript

- `strict` is on. **No `any` in agent code** (`agent/**`) — ever. Elsewhere, `unknown` +
  a narrowing guard instead of `any`.
- Prefer `type` aliases; derive types from Zod schemas with `z.infer<typeof Schema>` so a
  runtime schema and its compile-time type cannot drift.
- Explicit return types on exported functions.
- Import alias `@/*` → repo root (e.g. `@/db`, `@/lib/env`, `@/agent/graph`).

### LangGraph agent rules

- **Nodes are pure functions of state.** A node takes `TriageState`, returns a partial
  `TriageState`. Side effects (DB writes, SMS, external calls) are allowed **only** in the
  `execute` and `log_rejection` nodes.
- **Every tool** is a `tool()` wrapper with a **Zod input schema**. No bare functions
  passed as tools.
- The `human_approval` node body is minimal — `interrupt()` then return — because the
  node re-runs from its first line when the graph resumes.
- Audit-log rows are written from API routes after `invoke()` resolves, not from inside
  nodes (keeps nodes pure).
- LLM-calling nodes (`classify`, `propose`) wrap the call in try/catch with a safe
  fallback (`category: 'other'` / `type: 'no_action'`) so the graph never hard-crashes.

### Server boundaries

- DB client, env, auth, and anything touching secrets import `"server-only"` at the top.
- `getEnv()` is lazy — called inside a request handler / server function, never at module
  top level (mirrors `witus-inbox/lib/env.ts`).
- LangSmith is fail-soft: the app runs with `LANGSMITH_API_KEY` unset.

### Files & naming

- Root-level `app/`, `agent/`, `db/`, `lib/`, `scripts/`, `docs/`, `__tests__/` — no
  `src/` (matches `witus-inbox`).
- Files: `kebab-case.ts` for libs/routes, `camelCase.ts` for agent nodes/tools (the node
  name is the export), `PascalCase.tsx` for components.
- Tests live in `__tests__/` and end in `.test.ts`.

### Comments

- Comment the *why*, not the *what*. Match the surrounding density.
- Code-level docs (this file, README, lesson code blocks) are exempt from the APA
  citation rule; the `docs/lessons/` prose is **not** — see `CLAUDE.md`.

---

## 4. Component patterns

- Server Components by default; `"use client"` only for interactivity (the
  approve/reject form, status controls).
- A shared `cn()` helper (clsx + tailwind-merge) for conditional classes.
- Cards: `rounded-lg border border-slate-200 dark:border-slate-800 bg-white
  dark:bg-slate-900 p-4`.
- Section headers: small, uppercase, tracked, muted
  (`text-xs uppercase tracking-wide text-slate-500`).
- Badges encode status with both color and label (see §1 status colors).
- The ecosystem footer (three-column nav + verbatim Rise Wellness callout + B4C
  copyright) is implemented per `gemini/witus/public/brand/footer-recipe.md` with the
  violet swap. The Rise Wellness non-affiliation disclaimer is **byte-identical** — never
  paraphrased.
- **The menu (`SiteHeader`) and the ecosystem footer (`SiteFooter`) render on every page**,
  once, from the root layout (`app/layout.tsx`) — never per-route. `SiteHeader` is
  **auth-aware** (it reads the operator session): a signed-out visitor gets a minimal nav
  (Help, Sign in); the operator gets the full dashboard nav. The nav collapses to a
  hamburger below `sm` (`components/header-nav.tsx`, the only client part).
- User-facing help is a public route at **`/help`** (`app/help/page.tsx`), mirrored as
  markdown in `docs/operator-guide/`. Keep the category/action vocab on both in sync with
  `agent/schemas.ts`.

---

## 5. Definition of done for any UI change

1. Works at 320px width and up.
2. Keyboard-navigable; visible focus on every control.
3. Both light and dark themes verified.
4. No color-only status signals.
5. `npm run typecheck` and `npm run lint` pass.
6. New behavior has a test if it is testable without a browser.
