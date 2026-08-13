/**
 * CI guard: the live site must return *exactly* the headers declared in
 * `src/lib/security/headers.ts` on every security-sensitive route.
 *
 * Run with bun so it can import the shared policy directly — a copy of the
 * expected values here would be free to drift, which is the failure mode this
 * check exists to prevent.
 *
 * Usage: bun run scripts/security-headers-check.ts [origin]
 */
import {
  CONTENT_SECURITY_POLICY,
  CSP_REPORT_PATH,
  OAUTH_SENSITIVE_PATHS,
  PERMISSIONS_POLICY,
  evaluateSecurityHeaders,
} from "../src/lib/security/headers";

const ORIGIN = (process.argv[2] ?? process.env["GRADR_ORIGIN"] ?? "https://gradr.me").replace(/\/$/, "");
const SECURE = ORIGIN.startsWith("https:");

const PATHS = [...new Set([...OAUTH_SENSITIVE_PATHS, "/", "/pricing", "/status"])];

const failures: string[] = [];

for (const path of PATHS) {
  const response = await fetch(`${ORIGIN}${path}`, { redirect: "manual" });

  // Redirects and 404s are served by the hosting edge before our worker runs,
  // so they carry no policy of ours to verify — only documents count.
  if (response.status < 200 || response.status >= 300) {
    console.log(`  skipped ${path} (${response.status}, not a document response)`);
    continue;
  }

  const verdict = evaluateSecurityHeaders(response.headers, { secure: SECURE });


  for (const problem of verdict.problems) failures.push(`${path}: ${problem}`);
  for (const note of verdict.notes) console.log(`note ${path}: ${note}`);

  // Exact-match the two policies we author verbatim, so a silent edit upstream
  // (or a proxy rewriting them) is caught rather than "close enough".
  const csp = response.headers.get("content-security-policy");
  if (csp && csp !== CONTENT_SECURITY_POLICY) {
    failures.push(`${path}: CSP does not match the declared policy\n    got:      ${csp}\n    expected: ${CONTENT_SECURITY_POLICY}`);
  }
  const permissions = response.headers.get("permissions-policy");
  if (permissions && permissions !== PERMISSIONS_POLICY) {
    failures.push(`${path}: Permissions-Policy does not match the declared policy`);
  }
  const reportOnly = response.headers.get("content-security-policy-report-only");
  if (reportOnly && !reportOnly.includes(CSP_REPORT_PATH)) {
    failures.push(`${path}: report-only CSP does not point at ${CSP_REPORT_PATH}`);
  }

  console.log(`  checked ${path} (${response.status})`);
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} security-header problem(s) on ${ORIGIN}:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`\n✓ Security headers verified on ${PATHS.length} routes at ${ORIGIN}.`);
