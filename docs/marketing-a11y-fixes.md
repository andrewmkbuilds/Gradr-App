# gradr.me (Marketing repo) — accessibility fix pack

The marketing site lives in a **separate Lovable project** (`Gradr (Marketing)`,
id `7b3dd719-cb68-40fc-8226-772fdaf6ad36`). This app repo can only read a
snapshot of it, never write to it — so the two blocking defects are captured
here as exact, verified patches. Apply them in the marketing project, then
re-run the audit from this repo:

```sh
bun run audit:a11y:marketing        # audits the live https://gradr.me
bun run audit:a11y:baseline         # gate: fails only on NEW blocking findings
```

Line numbers below were verified against marketing snapshot commit `3b2326ef`.
Evidence for every item — exact selector, failing element HTML, axe failure
summary — is in `reports/a11y/gradr.me.html` / `.json` in this repo.

## 1. CTA contrast — `text-*` size roles collapsing the text colour

Failing selectors (serious, both themes, 390px and 1440px):

- `/ai-interview-coach` → `.transition-transform`
- `/job-application-tracker` → `.hover\:opacity-90.h-12.text-body`

Measured contrast **2.15:1** — foreground `#18292f` on background `#256074`.

Cause: the design system's `--text-*` roles are font *sizes*, but plain
`twMerge` classifies `text-body` as a *colour*. `buttonVariants({ size: "lg" })`
emits `h-12 px-6 text-body`, which drops `text-primary-foreground` from the
`primary` variant, so the CTA renders dark ink on teal.

Both failing CTAs are `<a className={cn(buttonVariants({ size: "lg" }), …)}>`
(e.g. `src/pages/AiInterviewCoach.tsx:448-451`). Do **not** patch the call
sites — fix the merge helper once.

Fix — replace `src/lib/utils.ts` in the marketing repo (currently plain
`twMerge`) with:

```ts
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Gradr's design-system `--text-*` roles are font sizes, not colours. Without
 * teaching tailwind-merge about them, a size class like `text-body` lands in
 * the text-color group and silently drops `text-primary-foreground` — which
 * turns primary CTAs into dark ink on teal (a WCAG contrast failure).
 */
const fontSizes = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "body-lg", "body", "body-sm",
  "caption", "overline", "button", "code",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...fontSizes] }],
      "text-color": [
        {
          text: [
            "foreground",
            "muted-foreground",
            "primary",
            "primary-foreground",
            "accent",
            "accent-foreground",
            "destructive",
            "destructive-foreground",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Keep it in sync with the design system's own `cn`
(`src/design-system/gradr-9b9b95/gradr/lib/cn.ts`). The marketing repo is on
`tailwind-merge@^2.6.0`, which exports `extendTailwindMerge` — no dependency
change needed.

## 2. Scrollable regions without keyboard access

Failing selectors on `/ai-interview-coach` (serious):

- `.overflow-x-auto.mt-6` → `src/pages/AiInterviewCoach.tsx:287`
- `.mt-4.overflow-x-auto` → `src/pages/AiInterviewCoach.tsx:318`

Both wrap a `min-w-[…]` table, so they scroll horizontally on mobile but have
no tab stop — keyboard users cannot pan them.

Fix — apply the pattern already used on the repo's fixed pages
(`src/pages/AtsResumeChecker.tsx:247-252`,
`src/pages/AiCoverLetterGenerator.tsx:241`,
`src/pages/JobApplicationTracker.tsx:249`):

```tsx
<div
  className="mt-6 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  tabIndex={0}
  role="group"
  aria-label="Interview scoring dimensions table, scrollable horizontally"
>
  <table className="w-full min-w-[640px] text-sm">
    <caption className="sr-only">…</caption>
```

and for line 318:

```tsx
<div
  className="mt-4 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  tabIndex={0}
  role="group"
  aria-label="Interview score bands table, scrollable horizontally"
>
```

`tabIndex={0}` gives the region a tab stop — arrow keys then scroll it
natively, so no custom keydown handler is needed (adding one would duplicate
native behaviour and risk trapping focus). `role="group"` + `aria-label` give
the stop an accessible name; the `focus-visible` ring makes it visible. No data
or behaviour changes.

### Remaining containers to sweep in the same pass

Not currently flagged by axe (they don't overflow at the audited widths), but
they share the assumption and will regress the moment content grows:

- `src/pages/blog/AiResumeOptimization.tsx:200`
- `src/pages/legal/LegalHub.tsx:46`
- `src/pages/MarketingEmailOps.tsx:492,650,758,815` (admin, internal)
- `src/components/legal/PolicyDocument.tsx:25`
- `src/components/interview/InterviewStudio.tsx:446`
- `src/components/NotificationsBell.tsx:49`

Dialog bodies (`VerificationDialog`, `InstitutionRequestDialog`) are inside a
Radix focus trap that already provides a tab stop — leave them alone.

## 3. Verification checklist

After applying and deploying the marketing changes:

1. `bun run audit:a11y:marketing` from this repo → `0 blocking`.
2. `bun run audit:a11y:baseline:update` → re-record the (now empty) baseline
   and commit `reports/a11y/baseline/gradr.me.json`.
3. Commit the regenerated `reports/a11y/gradr.me.{html,json}`.
