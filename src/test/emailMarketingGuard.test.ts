import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { EMAIL_TEMPLATE_CATALOG, TEMPLATE_INFO_BY_NAME } from "@/lib/email/templateCatalog";

/**
 * Gradr sends transactional email only. These tests are the structural half of
 * that guarantee: no marketing-shaped template may be registered, classified,
 * scheduled or sendable. The behavioural half (nothing marketing-shaped is
 * queued while a real user uses the app) lives in
 * `scripts/email-marketing-guard-e2e.mjs`.
 */

const FN_DIR = "supabase/functions";
const TEMPLATE_DIR = join(FN_DIR, "_shared/transactional-email-templates");

function read(path: string) {
  return readFileSync(path, "utf8");
}

/** Template names registered in the edge-function registry. */
function registeredTemplates(): string[] {
  const src = read(join(TEMPLATE_DIR, "registry.ts"));
  const body = src.split("export const TEMPLATES")[1] ?? "";
  return [...body.matchAll(/'([a-z0-9-]+)':/g)].map((m) => m[1]);
}

/** Classification entries from the edge-function source of truth. */
function classifiedTemplates(): Record<string, { kind: string; category: string }> {
  const src = read(join(TEMPLATE_DIR, "classification.ts"));
  const body = src.split("EMAIL_CLASSIFICATIONS: Record<string, EmailClassification> = {")[1] ?? "";
  const entries = [...body.matchAll(/'([a-z0-9-]+)':\s*\{\s*kind:\s*'(\w+)',\s*category:\s*'(\w+)'/g)];
  return Object.fromEntries(entries.map((m) => [m[1], { kind: m[2], category: m[3] }]));
}

describe("email classification", () => {
  const registry = registeredTemplates();
  const classification = classifiedTemplates();

  it("parses a non-trivial registry and classification", () => {
    expect(registry.length).toBeGreaterThan(20);
    expect(Object.keys(classification).length).toBe(registry.length);
  });

  it("classifies every registered template", () => {
    const missing = registry.filter((name) => !classification[name]);
    expect(missing, `unclassified templates: ${missing.join(", ")}`).toEqual([]);
  });

  it("classifies nothing that is not registered", () => {
    const orphans = Object.keys(classification).filter((name) => !registry.includes(name));
    expect(orphans, `classified but unregistered: ${orphans.join(", ")}`).toEqual([]);
  });

  it("registers zero marketing templates", () => {
    const marketing = Object.entries(classification)
      .filter(([, c]) => c.kind === "marketing")
      .map(([name]) => name);
    expect(marketing, `marketing templates registered: ${marketing.join(", ")}`).toEqual([]);
  });

  it("keeps the browser catalog in sync with the edge-function classification", () => {
    expect(EMAIL_TEMPLATE_CATALOG.map((t) => t.name).sort()).toEqual(registry.slice().sort());
    for (const [name, c] of Object.entries(classification)) {
      expect(TEMPLATE_INFO_BY_NAME[name]?.kind, `${name} kind`).toBe(c.kind);
      expect(TEMPLATE_INFO_BY_NAME[name]?.category, `${name} category`).toBe(c.category);
    }
  });
});

describe("no marketing or digest email surfaces remain", () => {
  it("has no digest, newsletter or campaign template files", () => {
    const offenders = readdirSync(TEMPLATE_DIR).filter((f) =>
      /(digest|briefing|newsletter|campaign|promo|announcement|drip|roundup)/i.test(f),
    );
    expect(offenders, `marketing-shaped template files: ${offenders.join(", ")}`).toEqual([]);
  });

  it("has no marketing-shaped template names in the registry", () => {
    const offenders = registeredTemplates().filter((n) =>
      /(digest|briefing|newsletter|campaign|promo|announcement|drip|roundup|weekly|monthly)/i.test(n),
    );
    expect(offenders, `marketing-shaped registered templates: ${offenders.join(", ")}`).toEqual([]);
  });

  it("schedules no recurring email job beyond the queue dispatcher", () => {
    const migrations = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
    const scheduled: string[] = [];
    for (const file of migrations) {
      const sql = read(join("supabase/migrations", file));
      for (const m of sql.matchAll(/cron\.schedule\s*\(\s*'([^']+)'/g)) scheduled.push(m[1]);
    }
    const emailish = scheduled.filter((job) => /digest|briefing|newsletter|campaign/i.test(job));
    expect(emailish, `recurring marketing jobs scheduled: ${emailish.join(", ")}`).toEqual([]);
  });

  it("does not let the daily-digest function send email", () => {
    let src: string;
    try {
      src = read(join(FN_DIR, "daily-digest/index.ts"));
    } catch {
      return; // function removed entirely — nothing to guard
    }
    expect(src).not.toMatch(/sendTemplateEmail|send-transactional-email|enqueue_email/);
  });
});

describe("send path enforcement", () => {
  const sendFn = read(join(FN_DIR, "send-transactional-email/index.ts"));

  it("refuses unclassified and marketing templates", () => {
    expect(sendFn).toMatch(/isMarketing\(templateName\)/);
    expect(sendFn).toMatch(/!EMAIL_CLASSIFICATIONS\[templateName\]/);
  });

  it("checks user preferences before queueing non-essential mail", () => {
    expect(sendFn).toMatch(/email_category_allowed/);
    expect(sendFn).toMatch(/category !== 'essential'/);
  });

  it("only lets end users trigger classified templates for themselves", () => {
    const userSendable = [...(sendFn.split("USER_SENDABLE = new Set([")[1] ?? "")
      .split("])")[0]
      .matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
    expect(userSendable.length).toBeGreaterThan(0);
    const unknown = userSendable.filter((n) => !TEMPLATE_INFO_BY_NAME[n]);
    expect(unknown, `user-sendable but unclassified: ${unknown.join(", ")}`).toEqual([]);
    const marketing = userSendable.filter((n) => TEMPLATE_INFO_BY_NAME[n]?.kind !== "transactional");
    expect(marketing).toEqual([]);
  });
});
