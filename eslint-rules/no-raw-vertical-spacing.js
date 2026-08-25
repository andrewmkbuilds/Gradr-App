/**
 * ESLint rule: block one-off vertical spacing utilities on public pages.
 *
 * Marketing, docs and legal routes share one fluid vertical rhythm (see
 * docs/vertical-rhythm.md). Hand-written `py-12`, `pb-10`, `mt-16`,
 * `space-y-10` … are what made those pages accumulate large unexplained empty
 * bands: each one is a fixed pixel value that ignores the fluid unit and
 * stacks on top of the section padding at some breakpoint.
 *
 * Use the shared utilities instead:
 *   .section-hero      hero padding (3xl top / lg bottom)
 *   .section-block     standard section padding (2xl block)
 *   .section-gap       gap between sibling sections (3xl top margin)
 *   .section-stack     rhythm between a section's children (md)
 *   .section-stack-lg  rhythm between top-level content blocks (2xl)
 *   .page-stack        app-shell page rhythm (md)
 *
 * Anything below the threshold (py-8 and under) is local component padding and
 * is left alone. Escape hatch, with a reason:
 *   // eslint-disable-next-line gradr/no-raw-vertical-spacing
 */
const PROPS = "py|pt|pb|my|mt|mb|space-y|gap-y";

/** Tailwind step at which a value stops being component padding and becomes
 *  section rhythm: 10 = 2.5rem = 40px. */
const THRESHOLD = 10;

const SCALE = new RegExp(`(?<![\\w-])(?:[a-z]+:)?(${PROPS})-(\\d+(?:\\.\\d+)?)(?![\\w-])`, "g");
const ARBITRARY = new RegExp(
  `(?<![\\w-])(?:[a-z]+:)?(${PROPS})-\\[([\\d.]+)(px|rem|em)\\]`,
  "g",
);

const SUGGESTION =
  "Use the shared rhythm utilities (section-hero, section-block, section-gap, section-stack, section-stack-lg) — see docs/vertical-rhythm.md.";

/** @returns {string[]} offending class names inside a className string */
function findViolations(value) {
  const hits = [];
  for (const m of value.matchAll(SCALE)) {
    if (Number(m[2]) >= THRESHOLD) hits.push(m[0]);
  }
  for (const m of value.matchAll(ARBITRARY)) {
    const px = m[3] === "px" ? Number(m[2]) : Number(m[2]) * 16;
    if (px >= THRESHOLD * 4) hits.push(m[0]);
  }
  return hits;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow fixed vertical spacing utilities on public pages; use the shared rhythm tokens.",
    },
    schema: [],
    messages: {
      rawSpacing: 'Fixed vertical spacing "{{match}}" breaks the shared rhythm. ' + SUGGESTION,
    },
  },
  create(context) {
    const report = (node, value) => {
      for (const match of findViolations(value)) {
        context.report({ node, messageId: "rawSpacing", data: { match } });
      }
    };

    return {
      Literal(node) {
        if (typeof node.value === "string") report(node, node.value);
      },
      TemplateElement(node) {
        if (node.value?.raw) report(node, node.value.raw);
      },
    };
  },
};
