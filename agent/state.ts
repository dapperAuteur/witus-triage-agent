/**
 * Graph state for the triage agent.
 *
 * `TriageState` is the single object that flows through every node. Each node
 * is a pure function `(state) => Partial<state>` — it reads what it needs and
 * returns only the fields it sets. LangGraph merges the partial with a
 * last-write-wins reducer (the default for a plain `Annotation`).
 *
 * The optional fields fill in as the graph progresses:
 *   classify   -> classification
 *   enrich     -> enrichment
 *   propose    -> proposedAction
 *   human_approval (resume) -> approval
 *   execute / log_rejection -> execution
 */
import { Annotation } from "@langchain/langgraph";
import type {
  RawSubmission,
  Classification,
  Enrichment,
  ProposedAction,
  Approval,
  Execution,
} from "./schemas";

export const TriageStateAnnotation = Annotation.Root({
  /** Set once, at graph invocation. The adapted Inbox submission. */
  rawSubmission: Annotation<RawSubmission>,

  /** Set by `classify`. */
  classification: Annotation<Classification | undefined>,

  /** Set by `enrich`. */
  enrichment: Annotation<Enrichment | undefined>,

  /** Set by `propose`. */
  proposedAction: Annotation<ProposedAction | undefined>,

  /** Set by `human_approval` when the graph resumes from the interrupt. */
  approval: Annotation<Approval | undefined>,

  /** Set by `execute` or `log_rejection`. */
  execution: Annotation<Execution | undefined>,
});

/** The fully-typed state object every node receives. */
export type TriageState = typeof TriageStateAnnotation.State;

/** What a node may return — a partial update merged into state. */
export type TriageStateUpdate = Partial<TriageState>;
