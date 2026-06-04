# FAQ & troubleshooting

## A run says it failed. What now?

Open the run and read the **audit trail** — it records what went wrong. Most failures are
temporary (a service was briefly unavailable). Nothing is lost; the message stays on
record, and you can revisit it.

## The agent picked the wrong category.

Use **Edit** or **Reject** — your decision always wins. The agent only proposes; it never
acts on its own, so a wrong guess never causes a wrong action unless you approve it.

## Can the agent send something without me?

No. The agent pauses at your approval and stays paused — across page reloads and even
server restarts — until you act. Execution is unreachable except through an approval.

## Working offline

The app keeps a copy of itself on your device, so you can open the dashboard and review the
last queue you loaded with no connection. **Making a decision needs to be online** — that's
deliberate, so an approval is never sent by accident. When you're offline, those buttons are
disabled with a clear notice rather than failing silently.

## How do I read the deep technical trace?

Each run links to its full trace (in LangSmith) from the run detail page. You won't usually
need it — it's there for debugging an unexpected result.

## Something else is off.

Email **bam@awews.com**.

---

← Back to the [operator guide index](README.md).
