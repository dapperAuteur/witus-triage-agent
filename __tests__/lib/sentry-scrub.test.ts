import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import {
  isPiiName,
  isSecretName,
  nameSegments,
  redactText,
  redactUrl,
  scrubEvent,
} from "@/lib/sentry-scrub";

/**
 * Every credential fixture below is ASSEMBLED AT RUNTIME from harmless fragments. A literal
 * `sk-ant-...` or `AIza...` string in a committed test file is what secret scanning blocks a push
 * for, and it has bounced other repos in this ecosystem. `join` and `repeat` produce the same
 * bytes at runtime without ever putting the pattern in the file.
 */
const FAKE = {
  anthropic: ["sk", "ant", "api03", `${"A".repeat(20)}9zQ`].join("-"),
  openai: ["sk", "proj", "b".repeat(30)].join("-"),
  cerebras: ["csk", "c".repeat(24)].join("-"),
  google: ["A", "I", "z", "a"].join("") + `${"D".repeat(30)}_x1`,
  langsmith: ["lsv2", "pt", "e".repeat(28)].join("_"),
  jwt: [`ey${"J"}${"f".repeat(20)}`, "g".repeat(24), "h".repeat(18)].join("."),
  opaque: "z".repeat(42),
  hmac: "9a".repeat(32),
  submitter: ["nadia", "okonkwo"].join(".") + "@" + ["example", "org"].join("."),
} as const;

/** A minimal well formed error event, freshly built per test so mutation cannot leak between them. */
function makeEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return { type: undefined, event_id: "abc123", ...overrides } as ErrorEvent;
}

/** Scrub, then assert against the serialised payload, which is what actually leaves the process. */
function scrubbedJson(event: ErrorEvent): string {
  return JSON.stringify(scrubEvent(event));
}

describe("sentry-scrub: portability", () => {
  it("contains no regex lookbehind (SyntaxError on iOS Safari below 16.4)", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../lib/sentry-scrub.ts", import.meta.url)),
      "utf8",
    );
    // Comments are stripped first: the module's own header documents WHY lookbehind is banned, and
    // that prose is not code the browser has to parse.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // `(?<=` and `(?<!` break the whole client chunk at parse time, even with no DSN set.
    expect(code).not.toMatch(/\(\?<[=!]/);
  });
});

describe("sentry-scrub: name segmentation", () => {
  it("splits snake, kebab, dotted and camel names into whole segments", () => {
    expect(nameSegments("ANTHROPIC_API_KEY")).toEqual(["anthropic", "api", "key"]);
    expect(nameSegments("x-api-key")).toEqual(["x", "api", "key"]);
    expect(nameSegments("headers.authorization")).toEqual(["headers", "authorization"]);
    expect(nameSegments("submitterEmail")).toEqual(["submitter", "email"]);
    expect(nameSegments("HTTPBearerToken")).toEqual(["http", "bearer", "token"]);
  });

  it("matches secret words per segment, so underscores do not hide them", () => {
    // `\b` treats `_` as a word char, so a `\bkey\b` implementation fails this test.
    expect(isSecretName("ANTHROPIC_API_KEY")).toBe(true);
    expect(isSecretName("NEXTAUTH_SECRET")).toBe(true);
    expect(isSecretName("TRIAGE_INGEST_SECRET")).toBe(true);
    expect(isSecretName("x_api_key")).toBe(true);
    expect(isSecretName("apiKey")).toBe(true);
  });

  it("does not treat a secret word as secret when it is only a substring", () => {
    expect(isSecretName("state")).toBe(false);
    expect(isSecretName("status")).toBe(false);
    expect(isSecretName("monkey_business")).toBe(false);
    expect(isSecretName("keyboardShortcut")).toBe(false);
    expect(isSecretName("passenger_count")).toBe(false);
    expect(isSecretName("designation")).toBe(false);
  });

  it("treats submission ids as triage data, not PII", () => {
    // Path context beats shape: the run id is how an operator finds the row.
    expect(isPiiName("submissionId")).toBe(false);
    expect(isPiiName("runId")).toBe(false);
    expect(isPiiName("formType")).toBe(false);
    // The content itself is PII.
    expect(isPiiName("submitterEmail")).toBe(true);
    expect(isPiiName("payload")).toBe(true);
  });
});

describe("sentry-scrub: provider key shapes", () => {
  it("redacts every provider key shape we hold, unlabelled, in free text", () => {
    const text = [
      `authentication failed for ${FAKE.anthropic}`,
      `retry used ${FAKE.openai} then ${FAKE.cerebras}`,
      `google said no to ${FAKE.google}`,
      `langsmith ingest rejected ${FAKE.langsmith}`,
      `cookie carried ${FAKE.jwt}`,
      `Authorization: Bearer ${FAKE.opaque}`,
      `signature mismatch ${FAKE.hmac}`,
    ].join("\n");
    const out = redactText(text);

    expect(out).not.toContain(FAKE.anthropic);
    expect(out).not.toContain(FAKE.openai);
    expect(out).not.toContain(FAKE.cerebras);
    expect(out).not.toContain(FAKE.google);
    expect(out).not.toContain(FAKE.langsmith);
    expect(out).not.toContain(FAKE.jwt);
    expect(out).not.toContain(FAKE.opaque);
    expect(out).not.toContain(FAKE.hmac);
    // The random tails must be gone, not merely the recognisable prefix.
    expect(out).not.toContain("A".repeat(20));
    expect(out).not.toContain("b".repeat(30));
    expect(out).not.toContain("D".repeat(30));
  });

  it("keeps the surrounding prose so the report is still diagnosable", () => {
    const out = redactText(`authentication failed for ${FAKE.anthropic}`);
    expect(out).toContain("authentication failed for");
    expect(out).toContain("anthropic-key");
  });

  it("does not eat ordinary words that merely contain a key prefix", () => {
    const out = redactText("risk-management-guide and basket-of-goods and eyJust-a-slug");
    expect(out).toContain("risk-management-guide");
    expect(out).toContain("basket-of-goods");
  });

  it("redacts an env-var-shaped assignment while keeping the variable name", () => {
    const out = redactText(`ANTHROPIC_API_KEY=${FAKE.anthropic} GEMINI_API_KEY=${FAKE.google}`);
    expect(out).not.toContain(FAKE.anthropic);
    expect(out).not.toContain(FAKE.google);
    // Knowing WHICH variable was wrong is the whole diagnostic value; keep the label.
    expect(out).toContain("ANTHROPIC_API_KEY=");
    expect(out).toContain("GEMINI_API_KEY=");
  });

  it("redacts a labelled opaque value that matches no known shape", () => {
    const out = redactText(`x-api-key: ${FAKE.opaque} retries=3`);
    expect(out).not.toContain(FAKE.opaque);
    expect(out).toContain("x-api-key:");
    // Counter-assertion: a non-secret label keeps its value.
    expect(out).toContain("retries=3");
  });

  it("strips credentials out of a database connection string", () => {
    const out = redactText("could not connect to postgresql://triage:hunter2pass@db.example.com/x");
    expect(out).not.toContain("hunter2pass");
    expect(out).toContain("postgresql://");
  });
});

describe("sentry-scrub: urls and query strings", () => {
  it("keeps the route and non-secret params, redacts secret and PII params", () => {
    const out = redactUrl(
      `https://triage.example.com/api/triage/runs?state=pending&runId=7f3a-42&submitterEmail=${FAKE.submitter}&token=${FAKE.opaque}`,
    );
    expect(out).toContain("/api/triage/runs");
    // `state` is NOT a secret. This is the over-redaction guard for substring matching.
    expect(out).toContain("state=pending");
    expect(out).toContain("runId=7f3a-42");
    expect(out).not.toContain(FAKE.opaque);
    expect(out).not.toContain(FAKE.submitter);
    expect(out).toContain("token=");
  });

  it("drops the whole query for token redemption paths (path context beats shape)", () => {
    const out = redactUrl(
      `https://triage.example.com/api/auth/callback/email?token=${FAKE.opaque}&callbackUrl=%2Ftriage`,
    );
    expect(out).toContain("/api/auth/callback/email");
    expect(out).not.toContain(FAKE.opaque);
    expect(out).not.toContain("callbackUrl");
  });

  it("drops the fragment, which can carry a token and is never needed for triage", () => {
    const out = redactUrl(`https://triage.example.com/triage#${FAKE.opaque}`);
    expect(out).not.toContain(FAKE.opaque);
    expect(out).toContain("/triage");
  });
});

describe("sentry-scrub: event level", () => {
  it("scrubs query_string separately from url", () => {
    // These are two independent fields on the payload; scrubbing only the URL still ships the query.
    const json = scrubbedJson(
      makeEvent({
        request: {
          url: "https://triage.example.com/api/triage/runs",
          query_string: `state=open&api_key=${FAKE.openai}&submitterEmail=${FAKE.submitter}`,
        },
      }),
    );
    expect(json).not.toContain(FAKE.openai);
    expect(json).not.toContain(FAKE.submitter);
    expect(json).toContain("state=open");
  });

  it("scrubs the tuple and record forms of query_string too", () => {
    const tuples = scrubbedJson(
      makeEvent({
        request: {
          query_string: [
            ["state", "open"],
            ["token", FAKE.opaque],
          ],
        },
      }),
    );
    expect(tuples).not.toContain(FAKE.opaque);
    expect(tuples).toContain("open");

    const record = scrubbedJson(
      makeEvent({ request: { query_string: { state: "open", secret: FAKE.opaque } } }),
    );
    expect(record).not.toContain(FAKE.opaque);
    expect(record).toContain("open");
  });

  it("drops the request body wholesale, because it is another person's submission", () => {
    const json = scrubbedJson(
      makeEvent({
        request: {
          method: "POST",
          url: "https://triage.example.com/api/triage/start",
          data: {
            submitterName: "Nadia Okonkwo",
            submitterEmail: FAKE.submitter,
            payload: {
              subject: "Rent increase after the inspection",
              message: "My landlord raised the rent right after I reported the mould.",
            },
          },
        },
      }),
    );
    expect(json).not.toContain("Nadia Okonkwo");
    expect(json).not.toContain(FAKE.submitter);
    expect(json).not.toContain("mould");
    expect(json).toContain("dropped:request-body");
    // The route and method survive: that is what tells you where it broke.
    expect(json).toContain("/api/triage/start");
    expect(json).toContain("POST");
  });

  it("removes credential headers and scrubs the rest", () => {
    const json = scrubbedJson(
      makeEvent({
        request: {
          headers: {
            authorization: `Bearer ${FAKE.opaque}`,
            cookie: `next-auth.session-token=${FAKE.jwt}`,
            "x-triage-signature": FAKE.hmac,
            "x-api-key": FAKE.openai,
            "user-agent": "Mozilla/5.0 (Macintosh)",
            "content-type": "application/json",
          },
        },
      }),
    );
    expect(json).not.toContain(FAKE.opaque);
    expect(json).not.toContain(FAKE.jwt);
    expect(json).not.toContain(FAKE.hmac);
    expect(json).not.toContain(FAKE.openai);
    expect(json).not.toContain("authorization");
    expect(json).not.toContain("cookie");
    // Counter-assertions: the diagnostic headers survive intact.
    expect(json).toContain("Mozilla/5.0 (Macintosh)");
    expect(json).toContain("application/json");
  });

  it("scrubs breadcrumbs, extra, tags and stack frame locals", () => {
    const json = scrubbedJson(
      makeEvent({
        message: `boot failed with ANTHROPIC_API_KEY=${FAKE.anthropic}`,
        exception: {
          values: [
            {
              type: "Error",
              value: `google rejected ${FAKE.google}`,
              stacktrace: {
                frames: [
                  {
                    filename: "agent/model.ts",
                    function: "buildChatModel",
                    vars: { apiKey: FAKE.openai, provider: "openrouter", attempt: 2 },
                  },
                ],
              },
            },
          ],
        },
        breadcrumbs: [
          {
            category: "fetch",
            message: `POST https://api.example.com/v1?token=${FAKE.opaque}`,
            data: { authorization: `Bearer ${FAKE.opaque}`, status_code: 401 },
          },
        ],
        extra: {
          runId: "3f9c1a7e",
          submission: { submissionId: "8821", submitterEmail: FAKE.submitter },
          langsmith: { LANGSMITH_API_KEY: FAKE.langsmith },
        },
        tags: { "triage.surface": "webhook", session_token: FAKE.jwt },
      }),
    );

    for (const secret of [
      FAKE.anthropic,
      FAKE.google,
      FAKE.openai,
      FAKE.opaque,
      FAKE.langsmith,
      FAKE.jwt,
      FAKE.submitter,
    ]) {
      expect(json).not.toContain(secret);
    }
    // Counter-assertions: the shape of the failure is fully preserved.
    expect(json).toContain("ANTHROPIC_API_KEY=");
    expect(json).toContain("agent/model.ts");
    expect(json).toContain("buildChatModel");
    expect(json).toContain("openrouter");
    expect(json).toContain("status_code");
    expect(json).toContain("401");
    expect(json).toContain("3f9c1a7e");
    expect(json).toContain("8821");
    expect(json).toContain("webhook");
  });

  it("preserves contexts.trace so events still correlate", () => {
    const event = makeEvent({
      contexts: {
        trace: { trace_id: "aaaaaaaabbbbbbbbccccccccdddddddd", span_id: "1111222233334444" },
        app: { app_name: "witus-triage-agent", authToken: FAKE.opaque },
      },
    });
    const json = scrubbedJson(event);
    expect(json).toContain("aaaaaaaabbbbbbbbccccccccdddddddd");
    expect(json).toContain("1111222233334444");
    expect(json).toContain("witus-triage-agent");
    expect(json).not.toContain(FAKE.opaque);
  });

  it("removes the account identity but keeps the id", () => {
    const json = scrubbedJson(
      makeEvent({
        user: { id: "operator-1", email: FAKE.submitter, ip_address: "203.0.113.7", username: "bam" },
      }),
    );
    expect(json).toContain("operator-1");
    expect(json).not.toContain(FAKE.submitter);
    expect(json).not.toContain("203.0.113.7");
    expect(json).not.toContain("bam");
  });

  it("never returns null, and survives cycles and deep nesting", () => {
    const cyclic: Record<string, unknown> = { name: "loop", token: FAKE.opaque };
    cyclic.self = cyclic;
    const event = makeEvent({ extra: { cyclic } });
    const result = scrubEvent(event);
    expect(result).not.toBeNull();
    expect(JSON.stringify(result)).not.toContain(FAKE.opaque);
  });

  it("is a no op on an event that carries nothing sensitive", () => {
    const json = scrubbedJson(
      makeEvent({
        message: "triage run 8821 failed at the propose node after 2 retries",
        tags: { "triage.surface": "api", node: "propose" },
      }),
    );
    expect(json).toContain("triage run 8821 failed at the propose node after 2 retries");
    expect(json).toContain("propose");
    expect(json).not.toContain("redacted");
  });
});
