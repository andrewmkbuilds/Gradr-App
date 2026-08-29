# gradr.me (Marketing repo) — accessibility fix pack

This app repo (app.gradr.me) cannot write to the marketing repo, so the fixes
below are captured here verbatim, already proven in this codebase. Apply them
in the marketing project and re-run:

```sh
bun run audit:a11y:marketing   # from this repo, audits the live marketing site
```

Evidence for every item is in `reports/a11y/gradr.me.html` / `.json`
(exact selector, failing element HTML and axe's failure summary).

## 1. CTA contrast — `text-*` size roles collapsing the text colour

Failing selectors (both light and dark, 390px and 1440px):

- `/ai-interview-coach` → `.hover\:opacity-90.h-12.px-6`
- `/job-application-tracker` → `.hover\:opacity-90.h-12.text-body`

Measured contrast **2.15:1** — foreground `#18292f` on background `#256074`.
Cause: the design system's `--text-*` roles are font sizes, but plain
`twMerge` classifies `text-body` as a *colour*, so it drops
`text-primary-foreground` from the primary CTA and the button falls back to
dark ink on teal.

Fix — replace the marketing repo's `cn` helper (`src/lib/utils.ts`) with:

```ts
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

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
(`src/design-system/gradr-9b9b95/gradr/lib/cn.ts`).

## 2. Scrollable regions without keyboard access

Failing selectors on `/ai-interview-coach`:

- `.overflow-x-auto.mt-6` → `<div class="mt-6 overflow-x-auto">`
- `.mt-4.overflow-x-auto` → `<div class="mt-4 overflow-x-auto">`

Both wrap a `min-w-[…]` comparison table, so they scroll horizontally on
mobile but cannot be reached or panned with the keyboard.

Fix — make the scroll container focusable and name it, exactly as this repo's
`src/pages/AiInterviewCoach.tsx` does:

```tsx
<div
  tabIndex={0}
  role="group"
  aria-label="Comparison table"
  className="mt-6 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
>
  <table className="w-full min-w-[640px] text-sm">
    <caption className="sr-only">…</caption>
```

`tabIndex={0}` gives the region a tab stop (arrow keys then scroll it
natively — no keyboard handler needed), `role="group"` + `aria-label` give it
an accessible name, and the `focus-visible` ring makes the stop visible. No
backend or data behaviour changes.

Sweep every `overflow-x-auto` / `overflow-y-auto` wrapper in the marketing
repo the same way — the app repo enforces this pattern for
`src/components/ui/table.tsx` and every marketing-style page.
