import type { Metadata } from "next";
import Link from "next/link";

/**
 * Public operator help — the non-developer onboarding guide. It lives outside
 * the gated `/triage` + `/admin` trees so a prospective operator can read it
 * before (or without) signing in. Header + footer come from the root layout.
 *
 * The category and action vocabularies below mirror `agent/schemas.ts`
 * (TRIAGE_CATEGORIES, ACTION_TYPES) and the markdown source of truth in
 * `docs/operator-guide/`. Keep all three in sync when the schema changes.
 */

export const metadata: Metadata = {
  title: "Help · WitUS Triage Agent",
  description:
    "How to use the WitUS Triage Agent — the queue, reading a run, approving and rejecting, and what the classifications mean. Written for operators, no coding required.",
};

const SECTIONS: { id: string; label: string }[] = [
  { id: "what", label: "What this tool does" },
  { id: "sign-in", label: "Signing in" },
  { id: "queue", label: "The queue" },
  { id: "run", label: "Reading a run" },
  { id: "decide", label: "Approve, reject, edit" },
  { id: "categories", label: "Categories" },
  { id: "actions", label: "Proposed actions" },
  { id: "waitlist", label: "Waitlist" },
  { id: "offline", label: "Offline" },
  { id: "faq", label: "FAQ" },
];

const CATEGORIES: { name: string; blurb: string }[] = [
  {
    name: "support_question",
    blurb: "Someone needs help using a product or has a how-do-I question.",
  },
  {
    name: "bug_report",
    blurb: "Something is broken or not behaving as expected.",
  },
  {
    name: "feature_request",
    blurb: "A suggestion or ask for something the product doesn't do yet.",
  },
  {
    name: "billing_issue",
    blurb: "Anything about payments, plans, refunds, or charges.",
  },
  {
    name: "abuse",
    blurb: "Harassment, threats, or misuse that needs a careful human eye.",
  },
  { name: "spam", blurb: "Junk — no real person waiting on a reply." },
  {
    name: "other",
    blurb: "Doesn't fit the buckets above, or the agent wasn't confident.",
  },
];

const ACTIONS: { name: string; blurb: string }[] = [
  {
    name: "auto_reply",
    blurb: "Send a prepared reply to the contact (only after you approve it).",
  },
  {
    name: "draft_for_human",
    blurb: "Prepare a draft reply for you to review and send yourself.",
  },
  {
    name: "escalate_sms",
    blurb: "Text the operator — this one is urgent and shouldn't wait.",
  },
  {
    name: "file_in_kb",
    blurb: "Save it to the knowledge base; no reply needed.",
  },
  { name: "mark_spam", blurb: "Flag as spam and close it out." },
  {
    name: "no_action",
    blurb: "Nothing to do — acknowledge and move on.",
  },
];

const eyebrow =
  "text-xs font-semibold uppercase tracking-wide text-slate-500";
const card =
  "rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const h2 = "text-xl font-semibold tracking-tight scroll-mt-20";
const body = "mt-2 leading-7 text-slate-600 dark:text-slate-400";

export default function HelpPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <p className={eyebrow}>Operator guide</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
        Using the Triage Agent
      </h1>
      <p className="mt-3 max-w-prose leading-7 text-slate-600 dark:text-slate-400">
        A plain-language guide to running the queue. No coding or admin setup
        required — if you can sign in, you can use everything here. Looking for
        the engineering docs instead? See the{" "}
        <a
          href="https://github.com/dapperAuteur/witus-triage-agent#readme"
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-700 hover:underline dark:text-violet-400"
        >
          README
          <span className="sr-only"> (opens in new tab)</span>
        </a>
        .
      </p>

      {/* On-page nav */}
      <nav aria-label="On this page" className="mt-6">
        <ul className="flex flex-wrap gap-2 text-sm">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="inline-flex min-h-9 items-center rounded-full border border-slate-200 px-3 text-slate-600 hover:border-violet-300 hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:border-slate-800 dark:text-slate-400 dark:hover:text-violet-400"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-10 space-y-10">
        <section id="what" aria-labelledby="what-h">
          <h2 id="what-h" className={h2}>
            What this tool does
          </h2>
          <p className={body}>
            Every message people send through the WitUS products (contact forms,
            feedback, and so on) lands in one shared inbox. The Triage Agent
            reads each new message and does the busywork for you, then{" "}
            <strong className="font-semibold text-slate-900 dark:text-slate-100">
              stops and waits for your decision
            </strong>{" "}
            before anything is actually sent or changed.
          </p>
          <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 font-mono text-sm">
            {["classify", "enrich", "propose", "your approval", "execute"].map(
              (node, i, arr) => (
                <li key={node} className="flex items-center gap-2">
                  <span className="rounded bg-violet-100 px-2 py-1 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                    {node}
                  </span>
                  {i < arr.length - 1 && (
                    <span aria-hidden="true" className="text-slate-400">
                      →
                    </span>
                  )}
                </li>
              ),
            )}
          </ol>
          <p className={body}>
            In words: it figures out what the message is about (classify), looks
            up helpful context (enrich), suggests what to do (propose), and then
            waits. Nothing irreversible happens until you approve.
          </p>
        </section>

        <section id="sign-in" aria-labelledby="sign-in-h">
          <h2 id="sign-in-h" className={h2}>
            Signing in
          </h2>
          <p className={body}>
            Go to{" "}
            <Link
              href="/signin"
              className="text-violet-700 hover:underline dark:text-violet-400"
            >
              the sign-in page
            </Link>{" "}
            and enter your email. If you&apos;re the operator, you&apos;ll get a
            one-time sign-in link by email — no password to remember. If
            you&apos;re not the operator yet, you&apos;ll be invited to join the
            waitlist instead. There&apos;s nothing to install.
          </p>
        </section>

        <section id="queue" aria-labelledby="queue-h">
          <h2 id="queue-h" className={h2}>
            The queue
          </h2>
          <p className={body}>
            <Link
              href="/triage"
              className="text-violet-700 hover:underline dark:text-violet-400"
            >
              The queue
            </Link>{" "}
            is your to-do list: every message waiting on your decision. Each row
            shows where it came from, what the agent thinks it is, and a status
            badge. Finished items move to{" "}
            <Link
              href="/triage/history"
              className="text-violet-700 hover:underline dark:text-violet-400"
            >
              History
            </Link>
            .
          </p>
          <ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-400">
            <li>
              <strong className="font-medium text-amber-600 dark:text-amber-400">
                Pending approval
              </strong>{" "}
              — waiting on you.
            </li>
            <li>
              <strong className="font-medium text-emerald-600 dark:text-emerald-400">
                Executed
              </strong>{" "}
              — you approved it and the action ran.
            </li>
            <li>
              <strong className="font-medium text-red-600 dark:text-red-400">
                Rejected / Failed
              </strong>{" "}
              — you declined it, or the action hit an error.
            </li>
          </ul>
          <p className={body}>
            Tip: it&apos;s built for phones. You can sweep the queue from
            anywhere.
          </p>
        </section>

        <section id="run" aria-labelledby="run-h">
          <h2 id="run-h" className={h2}>
            Reading a run
          </h2>
          <p className={body}>
            Tap a row to open it. A run is laid out in cards:
          </p>
          <ul className="mt-3 space-y-2 text-slate-600 dark:text-slate-400">
            <li>
              <strong className="font-medium text-slate-900 dark:text-slate-100">
                Classification
              </strong>{" "}
              — the category, a confidence score (0–100%), and a one-line reason.
            </li>
            <li>
              <strong className="font-medium text-slate-900 dark:text-slate-100">
                Context (enrichment)
              </strong>{" "}
              — past messages from the same person, the product&apos;s current
              health (green / yellow / red), and whether they&apos;re new,
              returning, or long-time.
            </li>
            <li>
              <strong className="font-medium text-slate-900 dark:text-slate-100">
                Proposed action
              </strong>{" "}
              — what the agent suggests doing, and why.
            </li>
            <li>
              <strong className="font-medium text-slate-900 dark:text-slate-100">
                Audit trail
              </strong>{" "}
              — a time-stamped log of everything that happened, plus a link to
              the full technical trace if you ever need it.
            </li>
          </ul>
        </section>

        <section id="decide" aria-labelledby="decide-h">
          <h2 id="decide-h" className={h2}>
            Approving, rejecting, editing
          </h2>
          <p className={body}>
            On a pending run you have three choices:
          </p>
          <ul className="mt-3 space-y-2 text-slate-600 dark:text-slate-400">
            <li>
              <strong className="font-medium text-emerald-600 dark:text-emerald-400">
                Approve
              </strong>{" "}
              — you agree with the proposed action; it runs.
            </li>
            <li>
              <strong className="font-medium text-violet-600 dark:text-violet-400">
                Edit
              </strong>{" "}
              — approve, but change the details first (for example, tweak a draft
              reply before it sends).
            </li>
            <li>
              <strong className="font-medium text-red-600 dark:text-red-400">
                Reject
              </strong>{" "}
              — decline. Add a short note so the reason is on the record. Nothing
              is sent.
            </li>
          </ul>
          <p className={body}>
            Your decision is the gate: until you act, no reply goes out and
            nothing changes.
          </p>
        </section>

        <section id="categories" aria-labelledby="categories-h">
          <h2 id="categories-h" className={h2}>
            What the categories mean
          </h2>
          <dl className={`${card} mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2`}>
            {CATEGORIES.map((c) => (
              <div key={c.name}>
                <dt className="font-mono text-sm text-violet-700 dark:text-violet-300">
                  {c.name}
                </dt>
                <dd className="text-sm text-slate-600 dark:text-slate-400">
                  {c.blurb}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="actions" aria-labelledby="actions-h">
          <h2 id="actions-h" className={h2}>
            What the agent can propose
          </h2>
          <dl className={`${card} mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2`}>
            {ACTIONS.map((a) => (
              <div key={a.name}>
                <dt className="font-mono text-sm text-violet-700 dark:text-violet-300">
                  {a.name}
                </dt>
                <dd className="text-sm text-slate-600 dark:text-slate-400">
                  {a.blurb}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="waitlist" aria-labelledby="waitlist-h">
          <h2 id="waitlist-h" className={h2}>
            Waitlist
          </h2>
          <p className={body}>
            <Link
              href="/triage/waitlist"
              className="text-violet-700 hover:underline dark:text-violet-400"
            >
              The waitlist
            </Link>{" "}
            lists people who asked to be notified when access opens up. It&apos;s
            a read-only roster; the central WitUS Inbox handles the actual
            invitations.
          </p>
        </section>

        <section id="offline" aria-labelledby="offline-h">
          <h2 id="offline-h" className={h2}>
            Working offline
          </h2>
          <p className={body}>
            The app keeps a copy of itself on your device, so you can open the
            dashboard and review the last queue you loaded even with no
            connection. Making a decision (approve / reject) needs to be online —
            that&apos;s deliberate, so an approval is never sent by accident. If
            you&apos;re offline, those buttons are disabled with a clear notice.
          </p>
        </section>

        <section id="faq" aria-labelledby="faq-h">
          <h2 id="faq-h" className={h2}>
            FAQ &amp; when something looks wrong
          </h2>
          <dl className="mt-3 space-y-4">
            <div>
              <dt className="font-medium text-slate-900 dark:text-slate-100">
                A run says it failed. What now?
              </dt>
              <dd className={body}>
                Open the run and check the audit trail — it records the error.
                Most failures are temporary (a service was briefly down); the
                message stays on record so nothing is lost.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-900 dark:text-slate-100">
                The agent picked the wrong category.
              </dt>
              <dd className={body}>
                Use <em>Edit</em> or <em>Reject</em> — your decision always wins.
                The agent only proposes; it never acts on its own.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-900 dark:text-slate-100">
                Something else is off.
              </dt>
              <dd className={body}>
                Email{" "}
                <a
                  href="mailto:bam@awews.com"
                  className="text-violet-700 hover:underline dark:text-violet-400"
                >
                  bam@awews.com
                </a>
                .
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}
