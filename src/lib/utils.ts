import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Gradr's design-system `--text-*` roles are font sizes, not colours. Without
 * teaching tailwind-merge about them, a size class like `text-body` lands in
 * the text-color group and silently drops `text-primary-foreground` — which
 * turns primary CTAs into dark ink on teal (a WCAG contrast failure).
 *
 * Keep this list in sync with the design system's own `cn`
 * (src/design-system/gradr-9b9b95/gradr/lib/cn.ts).
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
