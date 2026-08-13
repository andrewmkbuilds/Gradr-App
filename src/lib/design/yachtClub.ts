/**
 * Yacht Club design system — programmatic access to the palette.
 *
 * The CSS custom properties in `src/index.css` are the source of truth for
 * anything rendered in the DOM. This module exists for the two places that
 * cannot read CSS variables: canvas rendering (share cards) and generated
 * documents (PDF/HTML exports), which need literal colour values.
 *
 * Foundation colours — never edit these four without updating index.css:
 *   Soft White  #F2F0EF   Cool Gray  #BBBDBC
 *   Ocean Teal  #245F73   Mahogany   #733E24
 */

export const yachtClub = {
  softWhite: "#f2f0ef",
  coolGray: "#bbbdbc",
  oceanTeal: "#245f73",
  mahogany: "#733e24",

  /** Derived: deeper water for backgrounds and depth. */
  deepSea: "#0b1c22",
  harbour: "#123039",
  /** Derived: lighter teal tint for highlights on dark surfaces. */
  seaGlass: "#6ba6b8",
  /** Derived: warm ivory for document backgrounds. */
  ivory: "#faf8f6",
  /** Derived: darker mahogany for depth and hover states. */
  mahoganyDeep: "#542c19",
  /** Derived: warm brass, the muted metallic accent. */
  brass: "#a8763a",
  /** Derived: ink for body copy in documents. */
  ink: "#182a30",
  /** Derived: muted blue-gray for secondary text. */
  stone: "#6c7b80",
} as const;

/**
 * Chart series order. Mirrors --chart-1..6 so canvas/report output stays
 * consistent with on-screen charts.
 */
export const chartSeries = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
] as const;

/** Literal equivalents of chartSeries for canvas and exported documents. */
export const chartSeriesHex = [
  yachtClub.oceanTeal,
  "#94512f",
  "#4a90a4",
  yachtClub.brass,
  "#7d97a3",
  "#3a7a68",
] as const;

/** Default badge colour when a record has no explicit colour set. */
export const DEFAULT_TIER_COLOR = yachtClub.oceanTeal;
