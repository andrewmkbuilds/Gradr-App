/**
 * Automated safety net for the six Supabase authentication emails.
 *
 * For every template we render with a synthetic action URL that could only have
 * come from Supabase, then assert:
 *  - zero references to lovable.app, gradr-app, localhost or 127.0.0.1
 *  - no hardcoded https://gradr.me/ *action* link (brand/footer links are fine)
 *  - the CTA button href is byte-identical to the dynamic URL passed in
 *  - the copy/paste fallback link (if any) is the same dynamic URL
 *  - the plain-text version carries the same URL, so text-only clients work
 */
import * as React from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { AUTH_TEMPLATES, authUrlPropFor } from "./authSamples";
import {
  FORBIDDEN_EMAIL_STRINGS,
  inspectAuthEmailHtml,
  linksMatchActionUrl,
} from "@/lib/email/authLinkAudit";

/** Distinctive URL: if a template hardcodes anything, it cannot produce this. */
function dynamicUrl(type: string): string {
  return `https://xaeyjrekewnwjujnrqgu.supabase.co/auth/v1/verify?token=dyn_${type}_7f3a&type=${type}&redirect_to=${encodeURIComponent(
    "https://gradr.me/auth/callback?next=%2Fdashboard",
  )}`;
}

describe("authentication email templates", () => {
  it("covers all six Supabase auth actions", () => {
    expect(AUTH_TEMPLATES.map((t) => t.key).sort()).toEqual(
      ["email_change", "invite", "magiclink", "reauthentication", "recovery", "signup"].sort(),
    );
  });

  for (const entry of AUTH_TEMPLATES) {
    describe(entry.key, () => {
      const urlProp = authUrlPropFor(entry.key);
      const actionUrl = urlProp ? dynamicUrl(entry.key) : null;
      const props = { ...entry.props, ...(urlProp && actionUrl ? { [urlProp]: actionUrl } : {}) };

      const renderBoth = async () => {
        const element = React.createElement(entry.component, props);
        return {
          html: await render(element),
          text: await render(element, { plainText: true }),
        };
      };

      it("contains no forbidden hosts", async () => {
        const { html, text } = await renderBoth();
        const lower = `${html}\n${text}`.toLowerCase();
        for (const needle of FORBIDDEN_EMAIL_STRINGS) {
          expect(lower, `${entry.key} leaks ${needle}`).not.toContain(needle);
        }
      });

      it("has no hardcoded gradr.me action link", async () => {
        const { html } = await renderBoth();
        const { allHrefs } = inspectAuthEmailHtml(html);
        const hardcodedAction = allHrefs.filter(
          (href) =>
            href.startsWith("https://gradr.me") &&
            (/[?&](token|token_hash|code|confirmation_token)=/.test(href) || /[?&]type=/.test(href)),
        );
        expect(hardcodedAction).toEqual([]);
      });

      if (urlProp && actionUrl) {
        it("button href and fallback link equal the dynamic action URL", async () => {
          const { html } = await renderBoth();
          const inspection = inspectAuthEmailHtml(html);
          expect(inspection.buttonHref).toBe(actionUrl);
          expect(linksMatchActionUrl(inspection, actionUrl)).toBe(true);
        });

        it("plain-text version carries the dynamic action URL", async () => {
          const { text } = await renderBoth();
          expect(text).toContain(actionUrl);
        });
      } else {
        it("is code-only with no action link", async () => {
          const { html } = await renderBoth();
          const inspection = inspectAuthEmailHtml(html);
          expect(inspection.fallbackLinks).toEqual([]);
        });
      }
    });
  }
});
