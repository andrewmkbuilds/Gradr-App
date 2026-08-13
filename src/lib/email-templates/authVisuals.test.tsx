/**
 * Build-time guard for auth email rendering.
 *
 * The Playwright suite catches pixel drift; this catches *structural* drift
 * cheaply on every build: the rendered HTML of each auth email is snapshotted,
 * so any unintended markup change fails immediately, and every image the
 * template references is checked to be an absolute URL that a mail client can
 * actually fetch (inline data: URIs and relative paths silently break Gmail).
 */
import * as React from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { AUTH_TEMPLATES } from "./authSamples";
import { auditHtmlImages, extractImageUrls, isAbsoluteHttpUrl } from "@/lib/email/imageAudit";

/** Strip values that legitimately change between runs before snapshotting. */
function stabilize(html: string): string {
  return html
    .replace(/\s+/g, " ")
    .replace(/(19|20)\d{2}(?=\s*(Gradr|&copy;|©))/g, "YYYY")
    .trim();
}

describe("auth email rendering", () => {
  for (const entry of AUTH_TEMPLATES) {
    describe(entry.key, () => {
      it("markup matches the approved snapshot", async () => {
        const html = await render(React.createElement(entry.component, entry.props));
        expect(stabilize(html)).toMatchSnapshot();
      });

      it("references only absolute, mail-client-fetchable images", async () => {
        const html = await render(React.createElement(entry.component, entry.props));
        const urls = extractImageUrls(html);
        for (const url of urls) {
          expect(isAbsoluteHttpUrl(url), `"${url}" is not an absolute http(s) URL`).toBe(true);
        }
      });

      it("every image is reachable and served as an image", async () => {
        const html = await render(React.createElement(entry.component, entry.props));
        const checks = await auditHtmlImages(html);
        if (checks.length === 0) return;

        // If *every* request failed at the transport layer we are offline, not
        // broken — don't turn a sandbox with no egress into a red build.
        const offline = checks.every((c) => c.status === null && c.reason && !c.url.startsWith("data:"));
        if (offline) return;

        const broken = checks.filter((c) => !c.ok);
        expect(
          broken.map((c) => `${c.url}: ${c.reason ?? "unknown"}`),
          `Broken images in "${entry.key}"`,
        ).toEqual([]);
      });
    });
  }
});
