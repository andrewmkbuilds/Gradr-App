/**
 * End-to-end rendering tests for every registered transactional email template.
 *
 * For each template we render it exactly the way the send route does, then assert:
 *  - it produces a full, valid HTML email document
 *  - personalization from previewData actually appears in the output
 *  - every link is absolute and reachable (no relative/undefined hrefs)
 *  - the markup is responsive & email-client safe (600px table layout, inline styles)
 *  - the subject resolves (static or dynamic) and is non-empty
 *  - tracking injection + plain-text fallback produce sane output
 */
import * as React from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { TEMPLATES } from "./registry";
import {
  injectOpenPixel,
  rewriteLinksForTracking,
  toPlainText,
} from "@/lib/email/tracking";

const MESSAGE_ID = "00000000-0000-4000-8000-000000000abc";

const entries = Object.entries(TEMPLATES);

function extractHrefs(html: string): string[] {
  return Array.from(html.matchAll(/href=("|')([^"']*)\1/gi)).map((m) => m[2]);
}

function stringValues(data: Record<string, any> | undefined): string[] {
  if (!data) return [];
  return Object.values(data)
    .filter((v): v is string => typeof v === "string")
    .filter((v) => v.length > 2 && !v.startsWith("http") && !v.includes("@"));
}

describe("transactional email templates", () => {
  it("registers every template with a component and subject", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, tpl] of entries) {
      expect(tpl.component, `${name} component`).toBeTruthy();
      expect(tpl.subject, `${name} subject`).toBeTruthy();
    }
  });

  describe.each(entries)("%s", (name, tpl) => {
    const data = tpl.previewData ?? {};
    const element = React.createElement(tpl.component, data);

    it("renders a complete HTML document", async () => {
      const html = await render(element);
      expect(html).toContain("<html");
      expect(html).toContain("</html>");
      expect(html.length).toBeGreaterThan(200);
      expect(html).not.toContain("undefined");
      expect(html).not.toContain("[object Object]");
      expect(html).not.toContain("NaN");
    });

    it("resolves a non-empty subject", () => {
      const subject =
        typeof tpl.subject === "function" ? tpl.subject(data) : tpl.subject;
      expect(typeof subject).toBe("string");
      expect(subject.trim().length).toBeGreaterThan(3);
      expect(subject).not.toContain("undefined");
    });

    it("interpolates personalization data", async () => {
      const html = await render(element);
      const values = stringValues(data);
      for (const value of values) {
        expect(html, `${name} should render "${value}"`).toContain(value);
      }
    });

    it("only uses absolute, well-formed links", async () => {
      const html = await render(element);
      for (const href of extractHrefs(html)) {
        expect(href, `${name} href`).not.toBe("");
        expect(href).not.toContain("undefined");
        if (href.startsWith("mailto:") || href.startsWith("#")) continue;
        expect(() => new URL(href)).not.toThrow();
        expect(href.startsWith("http")).toBe(true);
      }
    });

    it("uses responsive, email-client safe markup", async () => {
      const html = await render(element);
      // table-based layout constrained to the standard 600px email width
      expect(html).toMatch(/<table/i);
      expect(html).toMatch(/max-width:\s*600px|width:\s*600px/i);
      // styles must be inline — external stylesheets are stripped by clients
      expect(html).not.toMatch(/<link[^>]+stylesheet/i);
      expect(html).not.toMatch(/<script/i);
      expect(html).toMatch(/style="/);
    });

    it("supports click tracking, open pixel and plain-text fallback", async () => {
      const html = await render(element);
      const tracked = injectOpenPixel(
        rewriteLinksForTracking(html, MESSAGE_ID),
        MESSAGE_ID,
      );
      expect(tracked).toContain("/api/public/email/open?m=");

      const hasExternalLink = extractHrefs(html).some(
        (h) => h.startsWith("http") && !/unsubscribe/i.test(h),
      );
      if (hasExternalLink) {
        expect(tracked).toContain("/api/public/email/click?");
      }
      // unsubscribe links are never rewritten
      for (const href of extractHrefs(tracked)) {
        if (/unsubscribe/i.test(href)) {
          expect(href).not.toContain("/api/public/email/click");
        }
      }

      const text = toPlainText(await render(element, { plainText: true }));
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toContain("<div");
      expect(text).not.toContain("undefined");
    });
  });
});
