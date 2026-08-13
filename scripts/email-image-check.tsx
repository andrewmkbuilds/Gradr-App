/**
 * Build gate: every image in every email template must be publicly reachable.
 *
 * Renders each registered app template AND each auth template, extracts every
 * <img src>, and requires HTTP 200 with a real image MIME type. Exits non-zero
 * on the first unreachable asset so a broken logo can never ship to an inbox.
 *
 * Usage: bun run scripts/email-image-check.tsx [--base https://gradr.me]
 */
import * as React from "react";
import { render } from "@react-email/render";
import { TEMPLATES } from "../src/lib/email-templates/registry";
import { AUTH_TEMPLATES } from "../src/lib/email-templates/authSamples";
import { auditHtmlImages, type ImageCheck } from "../src/lib/email/imageAudit";

const baseArg = process.argv.indexOf("--base");
const BASE = baseArg > -1 ? process.argv[baseArg + 1]! : "https://gradr.me";

interface Rendered {
  name: string;
  html: string;
}

async function renderAll(): Promise<Rendered[]> {
  const out: Rendered[] = [];

  for (const [name, entry] of Object.entries(TEMPLATES)) {
    const element = React.createElement(entry.component, entry.previewData ?? {});
    out.push({ name, html: await render(element) });
  }

  for (const entry of AUTH_TEMPLATES) {
    const element = React.createElement(entry.component, entry.props);
    out.push({ name: `auth:${entry.key}`, html: await render(element) });
  }

  return out;
}

// One network call per distinct URL, no matter how many templates use it.
const cache = new Map<string, Promise<ImageCheck[]>>();

async function main() {
  const rendered = await renderAll();
  const failures: { template: string; check: ImageCheck }[] = [];
  let checked = 0;

  for (const { name, html } of rendered) {
    const normalised = html.replaceAll("https://gradr.me", BASE);
    let audit = cache.get(normalised);
    if (!audit) {
      audit = auditHtmlImages(normalised);
      cache.set(normalised, audit);
    }
    for (const check of await audit) {
      checked += 1;
      if (!check.ok) failures.push({ template: name, check });
    }
  }

  console.log(
    `Checked ${checked} image reference(s) across ${rendered.length} email template(s) against ${BASE}`,
  );

  if (failures.length > 0) {
    console.error(`\n${failures.length} unreachable or invalid email image(s):`);
    for (const { template, check } of failures) {
      console.error(
        `  ✗ [${template}] ${check.url}\n      ${check.reason ?? "unknown"} (status ${
          check.status ?? "n/a"
        }, type ${check.contentType ?? "n/a"})`,
      );
    }
    process.exit(1);
  }

  console.log("All email images resolve with HTTP 200 and a valid image MIME type.");
}

main().catch((err) => {
  console.error("email-image-check failed:", err);
  process.exit(1);
});
