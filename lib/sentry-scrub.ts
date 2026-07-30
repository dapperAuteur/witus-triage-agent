import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Sentry `beforeSend` scrubber for the WitUS Triage Agent.
 *
 * WHY THIS FILE IS UNUSUALLY STRICT
 * ---------------------------------
 * This app is an LLM agent that triages *other people's* submissions. Two categories of data pass
 * through it, and both are worse to leak than an ordinary app's crash payload:
 *
 *  1. **Other people's words.** A submission carries `submitterEmail`, `submitterName`, and a free
 *     text `payload` written by a member of the public who never agreed to have it forwarded to an
 *     error vendor. So the whole request body is DROPPED rather than scrubbed: we cannot enumerate
 *     the keys a future form will use, and a body is never the thing that tells you why the code
 *     threw (the stack frame is). Losing it costs a little triage convenience; keeping it would
 *     copy a stranger's message into a third party's database.
 *  2. **LLM provider credentials.** The repo holds keys for seven providers plus LangSmith. A
 *     provider SDK that throws on a bad key frequently puts the key (or the whole `Authorization`
 *     header) into the error message, where no label is present to match on. So keys are also
 *     redacted BY SHAPE (`sk-`, `sk-ant-`, `csk-`, `AIza`, `lsv2_`, bare `Bearer`), unlabelled.
 *
 * DESIGN RULES (each one is here because the naive version of it fails)
 * --------------------------------------------------------------------
 *  - **No regex lookbehind.** `(?<=...)` / `(?<!...)` is a hard SyntaxError on iOS Safari < 16.4,
 *    and this module is imported by the CLIENT config, so a lookbehind would break the whole
 *    JavaScript chunk for those users even with no DSN set (the scrubber would never run, but the
 *    parse still fails). Left boundaries are done with a captured `(^|[^A-Za-z0-9])` group that is
 *    re-emitted via `$1`.
 *  - **Label boundaries must span `_`.** `\b` treats `_` as a word character, so `\bkey\b` never
 *    matches `ANTHROPIC_API_KEY`, which is exactly the shape a leaked env var has. Names are
 *    therefore split into segments on every non-alphanumeric character (plus camelCase) instead of
 *    being matched with `\b`.
 *  - **Match per name SEGMENT, not substring.** `state` is not a secret, and `monkey_business`
 *    only contains "key" by accident. A substring test redacts both and destroys triage data, so a
 *    name is secret only when one of its segments IS a secret word.
 *  - **Prefer path context over shape.** A triage run id and a bearer token can both look like a
 *    long opaque string. Run ids are the primary triage key (they are how an operator finds the
 *    row), so opaque path segments are NOT redacted by shape. Instead the query string is dropped
 *    wholesale for the endpoints that are token redemption endpoints by construction
 *    (`/api/auth/**`, where NextAuth magic link tokens live).
 *  - **The deep scrub is key aware.** Breadcrumbs, `extra`, `tags`, `contexts`, stack frame locals
 *    and `request.env` are walked recursively; a value is dropped when its KEY names a secret or
 *    PII, not only when the value happens to look like one. `contexts.trace` is exempt because it
 *    holds only `trace_id` / `span_id` / `op`, and scrubbing those breaks event correlation.
 *  - **Never returns null.** We still want every crash signal, just with the credentials and other
 *    people's data removed.
 */

/** Placeholder for a value dropped because its NAME says it is a credential. */
const REDACTED_SECRET = "[redacted:secret]";
/** Placeholder for a value dropped because its NAME says it is personal data. */
const REDACTED_PII = "[redacted:pii]";
/** Placeholder for a request body dropped in full (see rule 1 above). */
const DROPPED_BODY = "[dropped:request-body]";
/** Guard rail for pathological nesting. */
const MAX_DEPTH = 8;

/**
 * Name segments that mean "this is a credential". Compared against WHOLE segments, so `state`,
 * `status`, `monkey` and `keyboard` are all left alone while `API_KEY`, `apiKey`, `x-api-key` and
 * `headers.authorization` are all caught.
 */
const SECRET_SEGMENTS: ReadonlySet<string> = new Set([
  "apikey",
  "auth",
  "authorization",
  "bearer",
  "cookie",
  "cookies",
  "credential",
  "credentials",
  "csrf",
  "dsn",
  "hmac",
  "jwt",
  "key",
  "keys",
  "nonce",
  "otp",
  "pass",
  "passcode",
  "passwd",
  "password",
  "pin",
  "privatekey",
  "pwd",
  "salt",
  "secret",
  "secrets",
  "session",
  "sig",
  "signature",
  "token",
  "tokens",
]);

/**
 * Name segments that mean "this is somebody's personal data or their submitted text".
 *
 * `submission` is deliberately ABSENT: `submissionId` is the id an operator searches on, and
 * redacting it would make a report useless while protecting nothing (an id is not content). The
 * content lives under `payload` / `body` / `submitter*`, which are all listed. `message` is also
 * absent because an exception's own message is the core signal; string level redaction still runs
 * over it.
 */
const PII_SEGMENTS: ReadonlySet<string> = new Set([
  "address",
  "body",
  "dob",
  "email",
  "emails",
  "ip",
  "ipaddress",
  "mail",
  "payload",
  "phone",
  "rawbody",
  "ssn",
  "submitter",
  "tel",
  "telephone",
]);

/**
 * Query parameter names are matched with the same two sets. Nothing extra needed: `token`,
 * `secret`, `code` style params all carry a secret segment, and `email` carries a PII one.
 */

/**
 * Endpoints whose query string is a credential by construction. NextAuth magic link callbacks put
 * the sign in token in the query, so for these we drop the query entirely rather than trusting the
 * per parameter name list. This is the "path context beats shape" rule.
 */
const SECRET_PATH_RE = /^\/(api\/auth|api\/signin)(\/|$)/i;

/**
 * Shape based rules, applied to every string. Order matters: the most specific provider prefix
 * runs first so that `sk-ant-...` is not eaten by the generic `sk-...` rule, and the email rule
 * runs before the connection string rule so a `user:password@host` DSN is reduced exactly once.
 *
 * Every pattern that could appear mid word carries a `(^|[^A-Za-z0-9])` boundary group so that
 * `risk-management-guide` is not mistaken for an OpenAI key. No lookbehind anywhere.
 */
const SHAPE_RULES: ReadonlyArray<{ re: RegExp; replacement: string }> = [
  // Email addresses. Other people's addresses arrive here, so this runs unlabelled and early.
  {
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}/g,
    replacement: "[redacted:email]",
  },
  // Anthropic: sk-ant-api03-...
  {
    re: /(^|[^A-Za-z0-9])sk-ant-[A-Za-z0-9_-]{8,}/g,
    replacement: "$1[redacted:anthropic-key]",
  },
  // Cerebras: csk-...
  {
    re: /(^|[^A-Za-z0-9])csk-[A-Za-z0-9_-]{8,}/g,
    replacement: "$1[redacted:cerebras-key]",
  },
  // OpenAI and the OpenAI compatible providers we use (OpenRouter `sk-or-v1-...`, Together).
  {
    re: /(^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/g,
    replacement: "$1[redacted:openai-style-key]",
  },
  // Google / Gemini API keys.
  {
    re: /(^|[^A-Za-z0-9])AIza[A-Za-z0-9_-]{10,}/g,
    replacement: "$1[redacted:google-key]",
  },
  // LangSmith: lsv2_pt_... / lsv2_sk_...
  {
    re: /(^|[^A-Za-z0-9])lsv2_[A-Za-z0-9_-]{8,}/g,
    replacement: "$1[redacted:langsmith-key]",
  },
  // GitHub style tokens (ghp_, gho_, ghs_, ghr_, ghu_).
  {
    re: /(^|[^A-Za-z0-9])gh[pousr]_[A-Za-z0-9_]{16,}/g,
    replacement: "$1[redacted:github-token]",
  },
  // JSON web tokens, which is what a NextAuth session cookie contains.
  {
    re: /(^|[^A-Za-z0-9])eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}/g,
    replacement: "$1[redacted:jwt]",
  },
  // Any HTTP authorization scheme carrying an opaque value, label or no label.
  {
    re: /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    replacement: "$1 [redacted:credential]",
  },
  // Credentials embedded in a connection string, e.g. postgresql://user:pw@host/db.
  {
    re: /([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s:@]+@/g,
    replacement: "$1[redacted:credentials]@",
  },
  // Long hex blobs, which is what our HMAC request signatures are (64 hex chars).
  {
    re: /(^|[^A-Za-z0-9])[0-9a-f]{48,}/g,
    replacement: "$1[redacted:hex-digest]",
  },
];

/**
 * `NAME: value` / `NAME=value`, including the JSON form `"name": "value"`. The name is captured and
 * then tested by SEGMENT in the replacer, which is the only way to accept `ANTHROPIC_API_KEY` while
 * rejecting `monkey_business`. The value swallows an optional auth scheme word so that
 * `authorization: Bearer abc` redacts the token and not just the word "Bearer".
 *
 * The value class excludes `?`, `=` and `&` so that a value stops at a query delimiter. Without
 * that, `https://host/p?token=SECRET` matches as name `https` with everything after `:` as one
 * benign value, the whole string is kept, and the token ships. A `=` inside a value only ever
 * costs us base64 padding, which is not the secret.
 */
const LABELLED_RE =
  /([A-Za-z][A-Za-z0-9_.-]{0,80})(["'`]?\s*[:=]\s*["'`]?)((?:Bearer\s+|Basic\s+|Token\s+)?[^\s"'`,;&?=)[\]}]{4,})/g;

/**
 * Split a name into comparable segments. Handles `snake_case`, `kebab-case`, `dotted.paths`,
 * `camelCase` and `HTTPHeader` style runs. Both camelCase passes use capture groups only, because
 * the obvious lookbehind version breaks older Safari (see the header).
 */
export function nameSegments(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase());
}

/** True when any whole segment of `name` names a credential. */
export function isSecretName(name: string): boolean {
  return nameSegments(name).some((segment) => SECRET_SEGMENTS.has(segment));
}

/** True when any whole segment of `name` names personal data or submitted content. */
export function isPiiName(name: string): boolean {
  return nameSegments(name).some((segment) => PII_SEGMENTS.has(segment));
}

/** The placeholder a named value should be replaced with, or null to keep it. */
function placeholderFor(name: string): string | null {
  if (isSecretName(name)) return REDACTED_SECRET;
  if (isPiiName(name)) return REDACTED_PII;
  return null;
}

/**
 * Redact a free text string: provider key shapes first, then labelled assignments.
 */
export function redactText(input: string): string {
  let out = input;
  for (const rule of SHAPE_RULES) out = out.replace(rule.re, rule.replacement);
  out = out.replace(LABELLED_RE, (match, name: string, sep: string) => {
    const placeholder = placeholderFor(name);
    return placeholder ? `${name}${sep}${placeholder}` : match;
  });
  return out;
}

/** Redact the values of a `key=value&...` query string, keeping the parameter names visible. */
function redactQueryString(raw: string): string {
  const parts = raw.split("&").map((pair) => {
    const eq = pair.indexOf("=");
    if (eq < 0) return pair;
    const name = pair.slice(0, eq);
    const placeholder = placeholderFor(decodeURIComponent(name));
    return placeholder ? `${name}=${placeholder}` : `${name}=${redactText(pair.slice(eq + 1))}`;
  });
  return parts.join("&");
}

/**
 * Scrub a URL. Keeps origin plus path (the route is the single most useful field in a crash
 * report), redacts secret and PII query values by name, drops the whole query for token
 * redemption paths, and always drops the fragment (a fragment can carry a token and is never
 * needed for triage).
 */
export function redactUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Relative or malformed: fall back to plain text redaction rather than guessing an origin.
    return redactText(raw);
  }

  const base = `${url.origin}${url.pathname}`;
  if (SECRET_PATH_RE.test(url.pathname)) {
    return url.search ? `${base}?${REDACTED_SECRET}` : base;
  }
  if (!url.search) return redactText(base);
  return `${redactText(base)}?${redactQueryString(url.search.slice(1))}`;
}

/**
 * Key aware recursive scrub for the structured parts of an event.
 *
 * `key` is the name the value was found under (null at the root). When that name is a secret or
 * PII name the value is replaced WITHOUT being inspected, which is what protects an object shaped
 * payload whose own inner keys we cannot predict.
 */
function scrubValue(key: string | null, value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (key) {
    const placeholder = placeholderFor(key);
    if (placeholder) return placeholder;
  }
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") return "[unserializable]";
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(key, item, depth + 1, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    out[childKey] = scrubValue(childKey, childValue, depth + 1, seen);
  }
  return out;
}

/** Public entry point for the recursive scrub, used for `extra`, `contexts`, breadcrumb data. */
export function scrubDeep<T>(value: T): T {
  return scrubValue(null, value, 0, new WeakSet()) as T;
}

/** Headers that are credentials outright: removed, not scrubbed. */
const DROP_HEADERS = [
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-triage-signature",
  "x-triage-timestamp",
];

/**
 * `beforeSend` hook. Runs on the server, edge and browser runtimes.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.message) event.message = redactText(event.message);
  if (event.logentry?.message) event.logentry.message = redactText(event.logentry.message);
  if (event.logentry?.params) event.logentry.params = scrubDeep(event.logentry.params);
  if (event.transaction) event.transaction = redactText(event.transaction);

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactText(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) {
      // Local variables captured with a frame are a common accidental credential leak.
      if (frame.vars) frame.vars = scrubDeep(frame.vars);
    }
  }

  // Identity: this app has exactly one human operator, so the account id is enough to know "it was
  // the operator". Everything that identifies a person or their network is removed.
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
    delete event.user.username;
    delete event.user.name;
    for (const [key, value] of Object.entries(event.user)) {
      if (key === "id") continue;
      (event.user as Record<string, unknown>)[key] = scrubValue(key, value, 0, new WeakSet());
    }
  }

  if (event.request) {
    const request = event.request;
    if (typeof request.url === "string") request.url = redactUrl(request.url);

    // `query_string` is a SEPARATE field from `url`: Sentry populates both, so scrubbing the URL
    // alone still ships the parameters. It can be a string, a record, or tuples.
    if (typeof request.query_string === "string") {
      request.query_string = redactQueryString(request.query_string);
    } else if (Array.isArray(request.query_string)) {
      request.query_string = request.query_string.map(([name, value]) => {
        const placeholder = placeholderFor(name);
        return [name, placeholder ?? redactText(value)] as [string, string];
      });
    } else if (request.query_string && typeof request.query_string === "object") {
      request.query_string = scrubDeep(request.query_string);
    }

    // The body is another app's user's submission. It is not ours to forward, so it goes entirely.
    if (request.data !== undefined) request.data = DROPPED_BODY;
    delete request.cookies;
    if (request.env) request.env = scrubDeep(request.env);

    const headers = request.headers;
    if (headers) {
      for (const name of DROP_HEADERS) {
        delete headers[name];
        delete headers[name.toUpperCase()];
      }
      for (const [name, value] of Object.entries(headers)) {
        const placeholder = placeholderFor(name);
        headers[name] = placeholder ?? redactText(String(value));
      }
    }
  }

  if (event.extra) event.extra = scrubDeep(event.extra);

  if (event.tags) {
    for (const [name, value] of Object.entries(event.tags)) {
      const placeholder = placeholderFor(name);
      if (placeholder) event.tags[name] = placeholder;
      else if (typeof value === "string") event.tags[name] = redactText(value);
    }
  }

  if (event.breadcrumbs) {
    for (const crumb of event.breadcrumbs) {
      if (crumb.message) crumb.message = redactText(crumb.message);
      if (crumb.data) crumb.data = scrubDeep(crumb.data);
    }
  }

  if (event.contexts) {
    for (const [name, context] of Object.entries(event.contexts)) {
      // `trace` holds only ids Sentry needs to stitch events together; scrubbing it breaks that.
      if (name === "trace") continue;
      event.contexts[name] = scrubDeep(context);
    }
  }

  return event;
}
