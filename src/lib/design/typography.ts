/**
 * Gradr typography system.
 *
 * One scale, one place. Components import these tokens instead of stacking
 * ad-hoc `text-2xl font-bold tracking-tight` combinations, so display voice
 * (Bricolage Grotesque) and UI voice (Geist) never drift apart.
 *
 * The values map to utility classes defined in `src/index.css` (`.type-*`)
 * plus Tailwind utilities where a plain composition is clearer.
 */

export const typography = {
  /** Landing hero. One per page, maximum. */
  hero: "type-hero",
  /** Marketing section headline. */
  section: "type-section",
  /** Page title inside the app shell. */
  pageTitle: "type-h1",
  /** Major block inside a page. */
  h2: "type-h2",
  /** Card / panel title. */
  h3: "type-h3",
  /** Small grouping label above a list or field group. */
  h4: "type-h4",
  /** Uppercase kicker above a headline. */
  eyebrow: "type-eyebrow text-primary",
  /** Muted uppercase label inside dense UI. */
  overline: "type-overline text-muted-foreground",
  /** Marketing paragraph under a headline. */
  lede: "type-lede text-muted-foreground",
  /** Default reading text. */
  body: "type-body",
  /** Secondary reading text. */
  bodyMuted: "type-body text-muted-foreground",
  /** Compact supporting text. */
  bodySm: "type-body-sm text-muted-foreground",
  /** Helper text, timestamps, footnotes. */
  caption: "type-caption text-muted-foreground",
  /** Big numeric readout (scores, counts, currency). */
  metric: "type-metric",
  /** Small numeric readout inside stat tiles. */
  metricSm: "type-metric-sm",
  /** Monospaced data: IDs, tokens, code fragments. */
  mono: "type-mono",
} as const;

export type TypographyToken = keyof typeof typography;

/** `t("h3")` reads better than the object lookup inside JSX className strings. */
export function t(token: TypographyToken): string {
  return typography[token];
}
