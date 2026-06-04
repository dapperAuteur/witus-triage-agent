# Categories & actions

These are the labels you'll see on every run. They come straight from the agent's schema
(`agent/schemas.ts`) — if the app adds or renames one, update this file too.

## Categories — what the message *is*

The `classify` step picks exactly one:

| Category | Means |
|---|---|
| `support_question` | Someone needs help using a product or has a how-do-I question. |
| `bug_report` | Something is broken or not behaving as expected. |
| `feature_request` | A suggestion or ask for something the product doesn't do yet. |
| `billing_issue` | Anything about payments, plans, refunds, or charges. |
| `abuse` | Harassment, threats, or misuse that needs a careful human eye. |
| `spam` | Junk — no real person waiting on a reply. |
| `other` | Doesn't fit the buckets above, or the agent wasn't confident. |

## Actions — what the agent proposes *doing*

The `propose` step suggests one of these. None of them happen until you approve:

| Action | Means |
|---|---|
| `auto_reply` | Send a prepared reply to the contact (only after you approve it). |
| `draft_for_human` | Prepare a draft reply for you to review and send yourself. |
| `escalate_sms` | Text the operator — this one is urgent and shouldn't wait. |
| `file_in_kb` | Save it to the knowledge base; no reply needed. |
| `mark_spam` | Flag as spam and close it out. |
| `no_action` | Nothing to do — acknowledge and move on. |

## Next

- **[FAQ & troubleshooting](05-faq-and-troubleshooting.md)** — when something looks wrong.
