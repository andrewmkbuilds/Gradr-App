/**
 * Shared allowlist of console output that is environment noise rather than an
 * application defect.
 *
 * Every entry carries a `reason` and an `owner` so the list stays auditable:
 * the danger of an allowlist is that it silently grows until it swallows real
 * regressions. Keep patterns as narrow as possible — match the specific text,
 * never a whole category like /warning/i — and delete entries once the source
 * is fixed.
 *
 * Consumed by scripts/route-smoke.mjs and scripts/console-sweep.mjs.
 */

/**
 * @typedef {Object} AllowlistEntry
 * @property {string} id           Stable identifier, used in reports.
 * @property {RegExp} pattern      Matched against the console message text.
 * @property {"dev-only"|"third-party"|"ci-network"} kind
 * @property {string} reason       Why this cannot be fixed in app code.
 */

/** @type {AllowlistEntry[]} */
export const CONSOLE_ALLOWLIST = [
  {
    id: "lovable-tagger-refs",
    pattern: /Function components cannot be given refs/,
    kind: "dev-only",
    reason:
      "The Lovable component tagger attaches a callback ref to every JSX element in the dev bundle. Not app code and absent from production builds.",
  },
  {
    id: "react-devtools-nag",
    pattern: /Download the React DevTools/,
    kind: "dev-only",
    reason: "React's own suggestion banner in development builds.",
  },
  {
    id: "vite-hmr",
    pattern: /\[vite\] (connecting|connected|hot updated)/,
    kind: "dev-only",
    reason: "Vite HMR lifecycle chatter from the dev server.",
  },
  {
    id: "resize-observer-loop",
    pattern: /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/,
    kind: "third-party",
    reason:
      "Benign browser notification emitted by Radix/Recharts measurement; has no user-visible effect and no fix in app code.",
  },
  {
    id: "paddle-cdn-unreachable",
    pattern: /cdn\.paddle\.com/i,
    kind: "ci-network",
    reason: "Paddle.js is not reachable from CI runners; checkout is exercised by the payments e2e suites instead.",
  },
  {
    id: "posthog-unreachable",
    pattern: /(app|us|eu)(-assets)?\.posthog\.com/i,
    kind: "ci-network",
    reason: "Product analytics endpoint is blocked in CI.",
  },
  {
    id: "sentry-unreachable",
    pattern: /(ingest\.)?sentry\.io/i,
    kind: "ci-network",
    reason: "Error reporting endpoint is blocked in CI.",
  },
  {
    id: "tolt-unreachable",
    pattern: /files\.tlt-cdn\.com/i,
    kind: "ci-network",
    reason: "Affiliate tracking script is blocked in CI.",
  },
  {
    id: "unauthenticated-api-reads",
    pattern: /Failed to load resource: the server responded with a status of (401|403)/i,
    kind: "ci-network",
    reason:
      "Signed-out sweeps intentionally hit authenticated endpoints; route guards are covered by scripts/route-guards-e2e.mjs.",
  },
  {
    id: "offline",
    pattern: /net::ERR_INTERNET_DISCONNECTED/,
    kind: "ci-network",
    reason: "Runner lost egress; the network itself is not under test here.",
  },
];

/**
 * The allowlist entry matching a console message, or null when the message is
 * a genuine failure the caller must report.
 *
 * @param {string} text
 * @returns {AllowlistEntry | null}
 */
export function matchAllowlist(text) {
  return CONSOLE_ALLOWLIST.find((entry) => entry.pattern.test(text)) ?? null;
}

/** Convenience predicate. @param {string} text */
export function isAllowedConsoleMessage(text) {
  return matchAllowlist(text) !== null;
}

/**
 * Splits captured console text into genuine failures and allowlisted noise, so
 * callers can fail on the former while still reporting the latter.
 *
 * @param {string[]} messages
 * @returns {{ failures: string[], ignored: Array<{ text: string, id: string, kind: string }> }}
 */
export function partitionConsoleMessages(messages) {
  const failures = [];
  const ignored = [];
  for (const text of messages) {
    const entry = matchAllowlist(text);
    if (entry) ignored.push({ text, id: entry.id, kind: entry.kind });
    else failures.push(text);
  }
  return { failures, ignored };
}

/** Human-readable summary of what was suppressed, for smoke-test output. */
export function describeIgnored(ignored) {
  if (ignored.length === 0) return "";
  const counts = new Map();
  for (const item of ignored) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
  return [...counts.entries()].map(([id, n]) => `${id}×${n}`).join(", ");
}
