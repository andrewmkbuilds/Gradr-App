# Vertical rhythm

Every vertical gap on Gradr comes from one fluid unit. This page explains the
tokens, the utilities to use on new routes, how the lint rule enforces them, and
how to read the spacing-audit reports.

## The scale

Defined once in `src/index.css`:

```css
--rhythm-unit: clamp(1rem, 0.85rem + 0.9vw, 1.5rem); /* 17px → 24px */
--rhythm-xs:  calc(var(--rhythm-unit) * 0.5);
--rhythm-sm:  calc(var(--rhythm-unit) * 0.75);
--rhythm-md:  var(--rhythm-unit);
--rhythm-lg:  calc(var(--rhythm-unit) * 1.5);
--rhythm-xl:  calc(var(--rhythm-unit) * 1.75);
--rhythm-2xl: calc(var(--rhythm-unit) * 2);
--rhythm-3xl: calc(var(--rhythm-unit) * 2.25);
--rhythm-gutter: clamp(0.875rem, 0.5rem + 1.2vw, 1.5rem);
```

`--rhythm-unit` interpolates on a **single slope** from 17px at a 390px viewport
to 24px from 1224px up. Every step is an exact multiple of it, so the ratio
between panel padding, the gap between stacked children and the gap between
sections is identical at every breakpoint. Mobile is the same layout at a
smaller unit — never a different layout.

That is why hand-written `py-12` / `mt-16` are forbidden on public routes: a
fixed 48px sits at 2.8× the unit on mobile and 2× on desktop, so it silently
changes the page's proportions between breakpoints and stacks with a section's
own padding into an empty band.

## Which class to use on a new route

| Need | Class | Value |
| --- | --- | --- |
| Page container (max width + gutters) | `page-shell` | 72rem, `--rhythm-gutter` inline |
| Hero / first block of a page | `section-hero` | `3xl` top, `lg` bottom |
| Any other section's own padding | `section-block` | `2xl` block |
| Gap between sibling sections | `section-gap` | `3xl` top margin |
| Rhythm between a section's children | `section-stack` | `md` between children |
| Rhythm between top-level content blocks | `section-stack-lg` | `2xl` between children |
| App-shell page body | `page-stack` | `md` between children |
| Panel inner padding | `pad-panel` | `md` |

Rules of thumb:

- One `section-hero` per page, at the top. Everything after it is
  `section-block` or `section-gap` — never both on the same element.
- Reach for a stack utility before adding margins to children.
- Anything at or below `py-8` is component-local padding and is still fine.
- Missing a step? Add a token in `src/index.css` derived from `--rhythm-unit` —
  do not hand-roll a `clamp()`. `src/test/verticalRhythm.test.ts` fails if you do.

## The lint rule

`gradr/no-raw-vertical-spacing` (in `eslint-rules/no-raw-vertical-spacing.js`)
errors on `py|pt|pb|my|mt|mb|space-y|gap-y` at Tailwind step **10 or higher**
(and arbitrary values ≥ 40px), including responsive variants like `sm:py-16`.

It is scoped in `eslint.config.js` to the public surfaces — `src/surfaces/**`,
`src/pages/legal/**`, `src/pages/blog/**`, the marketing/tool landing pages and
`src/components/PublicShell.tsx`. App-internal screens keep their local padding.

```bash
bun run lint
```

Deliberate exception? Disable it on the line with a comment saying why:

```tsx
{/* eslint-disable-next-line gradr/no-raw-vertical-spacing -- print stylesheet needs a fixed band */}
<div className="pb-24 print:pb-0" />
```

## Reading a spacing-audit report

```bash
bun run audit:spacing               # measure + fail on regressions
bun run audit:spacing -- --report-only
bun run audit:spacing -- --update   # accept the current numbers as the baseline
```

The audit boots its own Vite server in multi-surface mode (`--mode audit`, see
`.env.audit`), walks every public route at mobile (390px), tablet (768px) and
desktop (1280px), and measures the gap between adjacent visible blocks inside
`<main>` — plus the last block → footer band on pages that actually scroll.

Output lands in `test-results/spacing-audit/`:

| File | What it is |
| --- | --- |
| `index.html` | Per-route report: every breakpoint with baseline, current and diff screenshots side by side |
| `report.md` | Same findings as markdown (used for the PR comment) |
| `report.json` | Machine-readable findings + per-route worst gap |
| `current/<route>-<breakpoint>.png` | This run's screenshot |
| `diff/<route>-<breakpoint>.png` | Pixel diff vs the committed baseline |

`tests/spacing/baseline/` holds the committed screenshots and
`tests/spacing/baseline.json` the accepted worst gap per route/breakpoint.

**How to interpret a row**

- `gap` — measured pixel gap between the two named blocks.
- `budget` — the per-breakpoint ceiling (72 / 88 / 104px), derived from
  `--rhythm-3xl` plus a section's own padding. Anything past it is drift.
- `baseline` — the gap accepted for that route/breakpoint on `main`.
- A finding **fails** the run when it is new (no baseline entry) or when it is
  worse than the baseline by more than the tolerance (8px). A gap that shrinks
  or stays flat is reported but never fails.
- `Not measured (redirected)` means the route bounced elsewhere and was never
  checked — treat that as a routing bug, not a pass.

The diff image tells you *what* changed; the table tells you *by how much*. When
a diff is intentional (a new section, a redesigned hero), re-run with `--update`
and commit `tests/spacing/baseline*` in the same PR so the reviewer sees the
before/after together.

## CI

`.github/workflows/spacing-audit.yml` runs the audit on every PR and push. It
uploads `test-results/spacing-audit/` as an artifact **even when it fails**, so
the HTML report and the diff images are always downloadable, and fails the job
only on new or worsening gaps.
