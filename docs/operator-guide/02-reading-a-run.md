# Reading a run

Tap any row in the queue to open it. A single message-in-progress is called a **run**, and
it's laid out as a few cards.

## Classification

What the agent thinks the message is about:

- **Category** — one of the [triage categories](04-categories-and-actions.md) (e.g.
  `support_question`, `bug_report`).
- **Confidence** — how sure the agent is, from 0 to 100%. Low confidence is a cue to read
  more carefully.
- **Rationale** — a one- or two-sentence reason for the category.

## Context (enrichment)

Helpful background the agent looked up automatically:

- **Past submissions** — other messages from the same person, so you have history.
- **Product health** — the current status of the product involved: **green** (fine),
  **yellow** (degraded), or **red** (down). A bug report during a red status reads
  differently than one during green.
- **Customer tenure** — whether this person is **new**, **returning**, or **long-time**,
  inferred from how often they've reached out.

## Proposed action

What the agent suggests doing, and its reasoning. See
[Categories & actions](04-categories-and-actions.md) for the full list of action types.
This is a *proposal* — it does not happen until you approve it.

## Audit trail

A time-stamped log of everything that happened on the run, including any errors. If you
ever need the deep technical view, there's a link to the full trace.

## Next

- **[Approving, rejecting, editing](03-approving-rejecting-editing.md)** — make the call.
