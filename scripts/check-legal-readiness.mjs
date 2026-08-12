#!/usr/bin/env node
/**
 * Pre-deployment legal readiness check.
 *
 * Paddle reviews the privacy, terms and refund pages before approving a
 * seller. This script asserts that each policy source still contains the
 * fields Paddle requires, so a content edit can never quietly remove them.
 *
 * Usage: node scripts/check-legal-readiness.mjs
 * Exit code 0 = ready, 1 = missing required fields.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/** Seller identity constants, parsed out of the TS source without a compiler. */
export function readSellerConfig() {
  const src = read("src/content/legal.ts");
  const pick = (name) => {
    const m = src.match(new RegExp(`export const ${name} = "([^"]+)"`));
    if (!m) throw new Error(`legal.ts is missing ${name}`);
    return m[1];
  };
  const days = src.match(/export const REFUND_WINDOW_DAYS = (\d+)/);
  return {
    legalName: pick("SELLER_LEGAL_NAME"),
    tradingName: pick("SELLER_TRADING_NAME"),
    contactEmail: pick("SELLER_CONTACT_EMAIL"),
    refundWindowDays: days ? Number(days[1]) : NaN,
  };
}

/**
 * Required content per policy surface. Each rule is a label plus a matcher run
 * against the page source (constants are interpolated at render time, so we
 * accept either the literal value or the constant identifier).
 */
export function legalReadinessChecks() {
  const cfg = readSellerConfig();
  const terms = read("src/content/legalDocs.ts");
  const refund = read("src/pages/legal/RefundPolicy.tsx");

  const seller = /SELLER_LEGAL_NAME|SELLER_TRADING_NAME/;
  const email = /SELLER_CONTACT_EMAIL|[\w.+-]+@[\w-]+\.[\w.]+/;

  const rules = [
    ["seller identity is configured", () => cfg.legalName.trim().length > 1],
    ["seller contact email is valid", () => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cfg.contactEmail)],
    ["refund window is a positive number of days", () => cfg.refundWindowDays > 0],

    ["terms: names the seller", () => seller.test(terms)],
    ["terms: provides a contact email", () => email.test(terms)],
    ["terms: names Paddle as Merchant of Record", () => /Merchant of Record/i.test(terms)],
    ["terms: describes billing and renewals", () => /renew(s|al)? automatically/i.test(terms)],
    ["terms: describes cancellation", () => /cancel/i.test(terms)],
    ["terms: references the refund window", () => /REFUND_WINDOW_DAYS|\d+-day refund/i.test(terms)],
    ["terms: states an effective date", () => /TERMS_V1_EFFECTIVE = "\d{4}-\d{2}-\d{2}"/.test(terms)],
    ["terms: covers governing law / disputes", () => /governing law|dispute/i.test(terms)],

    ["privacy: states an effective date", () => /PRIVACY_V1_EFFECTIVE = "\d{4}-\d{2}-\d{2}"/.test(terms)],
    ["privacy: names the data controller", () => seller.test(terms)],
    ["privacy: lists Paddle as a processor/recipient", () => /Paddle/.test(terms)],
    ["privacy: covers data subject rights", () => /your rights|right to (access|erasure|deletion)/i.test(terms)],
    ["privacy: covers retention", () => /retention|we retain|how long we keep/i.test(terms)],
    ["privacy: explains card data is not stored", () => /never see or store your full card/i.test(terms)],

    ["refund: names the seller", () => seller.test(refund)],
    ["refund: states the refund window", () => /REFUND_WINDOW_DAYS/.test(refund)],
    ["refund: explains how to request a refund", () => /how to request|request a refund/i.test(refund)],
    ["refund: names Paddle as Merchant of Record", () => /Merchant of Record/i.test(refund)],
    ["refund: gives a support contact", () => email.test(refund)],
    ["refund: states the refund method", () => /original payment method/i.test(refund)],
  ];

  return rules.map(([label, fn]) => {
    let ok = false;
    try {
      ok = !!fn();
    } catch {
      ok = false;
    }
    return { label, ok };
  });
}

export function runLegalReadiness() {
  const results = legalReadinessChecks();
  const failures = results.filter((r) => !r.ok);
  return { results, failures };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { results, failures } = runLegalReadiness();
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.label}`);
  console.log(`\n${results.length - failures.length}/${results.length} legal readiness checks passed`);
  if (failures.length) {
    console.error("Deployment blocked: policy pages are missing Paddle-required fields.");
    process.exit(1);
  }
}
