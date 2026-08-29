#!/usr/bin/env node
/**
 * Security header gate.
 *
 * Verifies the exact response headers we rely on for key routes and fails when
 * technology/version disclosure (CWE-200) is reintroduced — either through a
 * response header (x-powered-by, versioned Server, x-generator, ...) or through
 * an HTML `<meta name="generator">` tag.
 *
 * Only the tiers this repository can influence are blocking; headers that
 * only the hosting edge can emit are printed as warnings (docs/security-headers.md).
 *
 * Usage: node scripts/check-security-headers.mjs [baseUrl]
 * Default base URL: https://app.gradr.me (this repo is the app surface)
 */

import { securityHeaderReport, ROUTES, DISCLOSURE_HEADERS } from "./lib/securityHeaders.mjs";

const baseUrl = (process.argv[2] || process.env.SECURITY_HEADERS_TARGET || "https://app.gradr.me").replace(/\/$/, "");

const report = await securityHeaderReport(baseUrl);

let failed = 0;
for (const route of report.routes) {
  const status = route.failures.length === 0 ? (route.warnings?.length ? "WARN" : "PASS") : "FAIL";
  console.log(`\n${status}  ${route.url}  (HTTP ${route.status})`);
  for (const ok of route.passes) console.log(`   ✓ ${ok}`);
  for (const warning of route.warnings ?? []) console.log(`   ! ${warning}`);
  for (const failure of route.failures) {
    failed += 1;
    console.error(`   ✗ ${failure}`);
  }
}

console.log(
  `\nChecked ${report.routes.length} routes (${ROUTES.join(", ")}) against ${baseUrl}.` +
    `\nDisclosure headers screened: ${DISCLOSURE_HEADERS.join(", ")}.`,
);

if (failed > 0) {
  console.error(`\nSecurity header check failed with ${failed} problem(s).`);
  process.exit(1);
}

console.log("\nAll security header checks passed.");
