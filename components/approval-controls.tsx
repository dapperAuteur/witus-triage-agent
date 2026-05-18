"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ProposedAction } from "@/agent/schemas";

/**
 * Operator approve / edit / reject controls for a pending run.
 *
 * Offline-first (STYLEGUIDE §2): a decision is a deliberate, connected action.
 * When offline, the controls disable and say so — approvals are never queued.
 */
type Mode = "idle" | "editing" | "rejecting";

const textareaClasses =
  "w-full rounded-md border border-slate-300 bg-white p-2 text-sm " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 " +
  "dark:border-slate-700 dark:bg-slate-950";

export function ApprovalControls({
  runId,
  proposedAction,
}: {
  runId: string;
  proposedAction: ProposedAction;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  const initialDraft =
    typeof proposedAction.payload.draft === "string"
      ? proposedAction.payload.draft
      : "";
  const [draftText, setDraftText] = useState(initialDraft);
  const [note, setNote] = useState("");

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  async function submit(
    path: "approve" | "reject",
    body: Record<string, unknown>,
  ): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/triage/runs/${runId}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json: unknown = await res.json().catch(() => ({}));
        const message =
          json && typeof json === "object" && "error" in json
            ? String((json as { error: unknown }).error)
            : `Request failed (${res.status})`;
        throw new Error(message);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  }

  if (!online) {
    return (
      <p
        role="status"
        className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
      >
        You are offline. Reconnect to approve or reject this run — decisions are
        never queued.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {mode === "editing" && (
        <div className="space-y-2">
          <label
            htmlFor="draft-edit"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Edit the drafted reply
          </label>
          <textarea
            id="draft-edit"
            rows={8}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            className={textareaClasses}
          />
        </div>
      )}

      {mode === "rejecting" && (
        <div className="space-y-2">
          <label
            htmlFor="reject-note"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Rejection note (optional)
          </label>
          <textarea
            id="reject-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is this being rejected?"
            className={textareaClasses}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {mode === "idle" && (
          <>
            <Button
              variant="primary"
              disabled={pending}
              onClick={() => submit("approve", {})}
            >
              Approve
            </Button>
            {initialDraft.length > 0 && (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => setMode("editing")}
              >
                Edit reply
              </Button>
            )}
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => setMode("rejecting")}
            >
              Reject
            </Button>
          </>
        )}

        {mode === "editing" && (
          <>
            <Button
              variant="primary"
              disabled={pending}
              onClick={() =>
                submit("approve", {
                  editedPayload: { ...proposedAction.payload, draft: draftText },
                })
              }
            >
              Approve with edits
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setMode("idle");
                setDraftText(initialDraft);
              }}
            >
              Cancel
            </Button>
          </>
        )}

        {mode === "rejecting" && (
          <>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                submit("reject", note.trim() ? { operatorNote: note.trim() } : {})
              }
            >
              Confirm reject
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setMode("idle");
                setNote("");
              }}
            >
              Cancel
            </Button>
          </>
        )}
      </div>

      {pending && (
        <p className="text-sm text-slate-500" role="status">
          Working…
        </p>
      )}
    </div>
  );
}
