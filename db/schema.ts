/**
 * Drizzle schema for the WitUS Triage Agent.
 *
 * This repo owns its OWN database (ecosystem rule: databases are never shared
 * across apps). The `submission` table below is a faithful MIRROR of the
 * WitUS Inbox table of the same name — so the agent can run standalone on a
 * fresh local Postgres seeded with fixtures, and submissions arriving via the
 * signed webhook are stored locally.
 *
 * The two `triage_*` tables are new and specific to this agent.
 *
 * NOTE: the LangGraph Postgres checkpointer manages its OWN tables
 * (`checkpoints`, `checkpoint_writes`, …) via its `setup()` call. Those are
 * library-owned — they are deliberately NOT declared here, or drizzle-kit
 * would try to drop them.
 */
import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { AdapterAccount } from "next-auth/adapters";
// Relative import (not the `@/` alias) so drizzle-kit, which runs outside the
// Next/TS path-alias resolver, can load this schema file directly.
import type {
  Classification,
  Enrichment,
  ProposedAction,
  Approval,
  Execution,
} from "../agent/schemas";

/* ------------------------------------------------------------------ */
/* Mirror of the WitUS Inbox `submission` table (witus-inbox/db/schema)*/
/* ------------------------------------------------------------------ */

export const submissionStatus = pgEnum("submission_status", [
  "new",
  "in_progress",
  "replied",
  "waiting",
  "closed",
]);

export const submissionPriority = pgEnum("submission_priority", [
  "normal",
  "high",
]);

export const receivedVia = pgEnum("received_via", [
  "webhook",
  "email",
  "manual",
]);

export const submissions = pgTable("submission", {
  id: uuid("id").defaultRandom().primaryKey(),
  source: text("source").notNull(),
  formType: text("form_type").notNull(),
  submitterEmail: text("submitter_email"),
  submitterName: text("submitter_name"),
  payload: jsonb("payload").notNull(),
  status: submissionStatus("status").notNull().default("new"),
  priority: submissionPriority("priority").notNull().default("normal"),
  receivedVia: receivedVia("received_via").notNull().default("webhook"),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  threadId: text("thread_id"),
});

/* ------------------------------------------------------------------ */
/* triage_runs — one row per agent run. The row id doubles as the      */
/* LangGraph `thread_id`, so the approval request can resume the exact */
/* graph thread with nothing but the run id from its URL.              */
/* ------------------------------------------------------------------ */

export const triageRunStatus = pgEnum("triage_run_status", [
  // graph is mid-flight (between /start and the human_approval interrupt)
  "running",
  // interrupt reached — waiting for the operator
  "pending_approval",
  // operator approved; execute step not yet finished
  "approved",
  // operator rejected — log_rejection ran
  "rejected",
  // execute step completed successfully
  "executed",
  // graph or execute step threw
  "failed",
]);

export const triageRuns = pgTable("triage_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => submissions.id, { onDelete: "cascade" }),
  status: triageRunStatus("status").notNull().default("running"),
  classification: jsonb("classification").$type<Classification>(),
  enrichment: jsonb("enrichment").$type<Enrichment>(),
  proposedAction: jsonb("proposed_action").$type<ProposedAction>(),
  approval: jsonb("approval").$type<Approval>(),
  execution: jsonb("execution").$type<Execution>(),
  langsmithRunId: text("langsmith_run_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------------------ */
/* triage_audit_log — append-only event trail per run. Rows are        */
/* written from API routes after a graph invoke resolves, never from   */
/* inside nodes (nodes stay pure — STYLEGUIDE §3).                     */
/* ------------------------------------------------------------------ */

export const triageAuditLog = pgTable("triage_audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id")
    .notNull()
    .references(() => triageRuns.id, { onDelete: "cascade" }),
  // 'started' | 'classified' | 'enriched' | 'proposed'
  //  | 'approved' | 'rejected' | 'executed' | 'failed'
  event: text("event").notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------------------ */
/* NextAuth tables — standard @auth/drizzle-adapter shape.             */
/* The operator dashboard signs in here; only ADMIN_EMAIL is allowed.  */
/* ------------------------------------------------------------------ */

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", {
    mode: "date",
    withTimezone: true,
  }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

export type Submission = typeof submissions.$inferSelect;
export type TriageRun = typeof triageRuns.$inferSelect;
export type TriageAuditLog = typeof triageAuditLog.$inferSelect;
