import { countWaitlistSignups, listWaitlistSignups } from "@/lib/waitlist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIMIT = 50;
const INBOX_URL =
  "https://inbox.witus.online/inbox?source=witus-triage-agent&form_type=waitlist-signup";

/**
 * /triage/waitlist — non-admins who asked to be notified. Inside the `/triage`
 * layout, so it inherits the operator-session gate. Replies happen in the
 * central WitUS Inbox, where every signup is also published as a submission.
 */
export default async function WaitlistPage() {
  const [total, signups] = await Promise.all([
    countWaitlistSignups(),
    listWaitlistSignups(LIMIT),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Waitlist</h1>
      <p className="mt-1 text-sm text-slate-500">
        {total === 0
          ? "No one has joined the waitlist yet."
          : `${total} ${total === 1 ? "person" : "people"} on the waitlist.`}
      </p>

      <a
        href={INBOX_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex min-h-11 items-center rounded-md bg-violet-600 px-4 text-sm font-medium text-white transition-colors hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
      >
        Manage in WitUS Inbox →<span className="sr-only"> (opens in new tab)</span>
      </a>
      <p className="mt-2 text-xs text-slate-500">
        Every signup is also a submission in the central Inbox — reply and
        archive there.
      </p>

      <div className="mt-6">
        {signups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
            No signups yet. A non-admin who tries to sign in can join from the
            sign-in page.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {signups.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2 font-mono">{s.email}</td>
                    <td className="px-4 py-2 text-slate-500">
                      {s.createdAt.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > LIMIT && (
          <p className="mt-2 text-xs text-slate-500">
            Showing the {LIMIT} most recent of {total}.
          </p>
        )}
      </div>
    </div>
  );
}
