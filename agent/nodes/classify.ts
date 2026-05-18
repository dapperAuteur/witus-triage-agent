/**
 * `classify` node — the first node in the graph.
 *
 * Assigns the submission a category, a confidence, and a short rationale via
 * a single structured-output call to the configured LLM (Gemini for testing,
 * Claude for production — see agent/model.ts). Pure: it reads
 * `state.rawSubmission` and returns only `{ classification }`.
 *
 * Fail-soft: any error (API down, malformed output) is caught and turned into
 * an `other` classification with confidence 0, so the graph never hard-crashes
 * on a bad input (STYLEGUIDE §3).
 */
import { ClassificationSchema } from "../schemas";
import { getChatModel } from "../model";
import type { TriageState, TriageStateUpdate } from "../state";

const SYSTEM_PROMPT = `You are the triage classifier for WitUS Inbox, which collects \
form submissions from across the WitUS product ecosystem (CentenarianOS, Work.WitUS, \
FlashLearnAI, Wanderlearn, Fly.WitUS, witus.online, and others).

Classify each submission into exactly one category:

- support_question — the sender wants help understanding or using the product; nothing
  is broken. "How do I…", "Where is…".
- bug_report — the sender describes the product behaving incorrectly: errors, crashes,
  features not working as designed.
- feature_request — the sender suggests new functionality or an improvement.
- billing_issue — anything about payments, charges, refunds, subscriptions, promo codes,
  or pricing.
- abuse — hostile, threatening, harassing, or otherwise abusive content directed at the
  team. Not the same as a frustrated-but-legitimate complaint.
- spam — unsolicited bulk content, scams, phishing, or marketing unrelated to WitUS.
- other — a genuine message that fits none of the above (e.g. plain praise, a general
  comment, an off-topic but harmless note).

Pick the single best-fitting category. Set "confidence" to your true certainty (0–1).
Keep "rationale" to one or two sentences naming the signal that decided the category.`;

export async function classify(
  state: TriageState,
): Promise<TriageStateUpdate> {
  const { rawSubmission } = state;

  const userMessage = [
    `Product: ${rawSubmission.productSlug}`,
    `Form type: ${rawSubmission.formType}`,
    `Priority flag: ${rawSubmission.priority}`,
    "",
    "Submission text:",
    rawSubmission.body,
  ].join("\n");

  try {
    const model = getChatModel({ temperature: 0 }).withStructuredOutput(
      ClassificationSchema,
      { name: "classify_submission" },
    );
    const classification = await model.invoke([
      ["system", SYSTEM_PROMPT],
      ["human", userMessage],
    ]);
    return { classification };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "unknown error";
    return {
      classification: {
        category: "other",
        confidence: 0,
        rationale: `Classification failed; defaulted to "other". ${errorMessage}`,
      },
    };
  }
}
