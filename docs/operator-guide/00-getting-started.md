# Getting started

## The 60-second mental model

People send messages through the WitUS products: contact forms, feedback, and the like.
They all land in one shared inbox. Reading every one by hand doesn't scale, so the Triage
Agent does the busywork and then **stops and waits for your decision**:

```
classify → enrich → propose → your approval → execute
```

- **classify**: figures out what the message is about.
- **enrich**: looks up helpful context (past messages, product health, who they are).
- **propose**: suggests what to do, and why.
- **your approval**: it pauses here. Nothing irreversible happens until you act.
- **execute**: once you approve, the action runs.

The agent only ever *proposes*. You are the gate.

## Signing in

1. Open the app and go to **Sign in** (top-right menu, or `/signin`).
2. Enter your email.
   - **Operator:** you'll get a one-time sign-in link by email. No password.
   - **Not yet invited:** you'll be offered the waitlist instead.
3. Click the link in your email. You're in.

There's nothing to install. It works on your phone.

### Sign in with WitUS

If ecosystem SSO is configured for this deployment, the sign-in page also offers
**Sign in with WitUS** — the same account you use across the WitUS products. Two things
to know:

- **"Continue as ..."** — when you're already signed in to another WitUS app in the same
  browser, the button may read `Continue as <your name>` instead. It's a shortcut, not a
  different door: clicking it runs the same sign-in, and the operator gate still applies.
  Some browsers (Safari, Firefox) block the check that produces that label. When they do,
  the button just says "Sign in with WitUS" and works exactly as before — nothing is broken.
- **Sign out** signs you out of this app only. Your WitUS account and any other WitUS apps
  stay signed in. To also sign out of WitUS, use **Sign out of WitUS everywhere** in the
  menu. Other WitUS apps you are signed in to stay signed in until you sign out of them.

## Where to go next

- Land on **[The queue](01-the-queue.md)**: your to-do list of messages waiting on you.
