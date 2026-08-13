// Runs before `vite dev` and `vite build`; writes public/sitemap.xml.
// Entries and the serializer live in src/lib/sitemap.ts so tests can assert
// the committed file stays in sync with routing.
import { writeFileSync } from "fs";
import { resolve } from "path";
import { SITEMAP_ENTRIES, generateSitemap, validateSitemap } from "../src/lib/sitemap";

const xml = generateSitemap(SITEMAP_ENTRIES);
const errors = validateSitemap(xml);
if (errors.length) {
  console.error("sitemap validation failed:\n - " + errors.join("\n - "));
  process.exit(1);
}

writeFileSync(resolve("public/sitemap.xml"), xml);
console.log(`sitemap.xml written (${SITEMAP_ENTRIES.length} entries)`);
