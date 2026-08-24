/**
 * Seller identity + policy content shared by the privacy, terms and refund
 * pages. Paddle's readiness check reads these pages, so they must stay
 * publicly accessible (no auth) and must name the seller and Paddle's role.
 *
 * SELLER IDENTITY IS CONFIGURABLE — single source of truth.
 * The values below are TEMPORARY placeholders for the development/testing
 * phase. When the final verified legal business (or individual) name is
 * provided, change it here only: every policy page, billing disclosure and
 * checkout-facing reference reads from these constants. Do not hardcode the
 * seller name anywhere else.
 */
export const SELLER_LEGAL_NAME = "Gradr"; // TEMPORARY — replace at go-live
export const SELLER_CONTACT_EMAIL = "support@gradr.me";
export const SELLER_TRADING_NAME = "Gradr";
export const SELLER_DOMAIN = "gradr.me";
export const SELLER_WEBSITE_URL = "https://gradr.me";
export const REFUND_WINDOW_DAYS = 30;
export const POLICIES_UPDATED = "2026-08-12";

/** Compact list shown in the footer and the policy page header nav. */
export const LEGAL_PAGES = [
  { path: "/terms", label: "Terms" },
  { path: "/privacy", label: "Privacy" },
  { path: "/cookie-policy", label: "Cookies" },
  { path: "/acceptable-use", label: "Acceptable use" },
  { path: "/ai-disclosure", label: "AI disclosure" },
  { path: "/disclaimer", label: "Disclaimer" },
  { path: "/refund-policy", label: "Refunds" },
  { path: "/subprocessors", label: "Sub-processors" },
  { path: "/dpa", label: "DPA" },
  { path: "/affiliate-disclosure", label: "Affiliates" },
  { path: "/legal", label: "Legal & contact" },
] as const;

/** Full index with descriptions, rendered on the /legal hub. */
export const LEGAL_INDEX = [
  { path: "/terms", title: "Terms & Conditions", summary: "The contract between you and Gradr." },
  { path: "/privacy", title: "Privacy Notice", summary: "What we collect, why, who receives it, and your rights." },
  { path: "/cookie-policy", title: "Cookie Policy", summary: "Cookies and storage we set, and how to change your choices." },
  { path: "/acceptable-use", title: "Acceptable Use Policy", summary: "Content standards and prohibited activity." },
  { path: "/ai-disclosure", title: "AI Usage & Disclaimer", summary: "How AI is used, its limits, and who processes your content." },
  { path: "/disclaimer", title: "Disclaimer & Liability", summary: "No outcome guarantees, and the limits of our liability." },
  { path: "/refund-policy", title: "Refund & Cancellation Policy", summary: "Refund window, cancellations and statutory rights." },
  { path: "/subprocessors", title: "Sub-processors", summary: "Every third party that can process your data." },
  { path: "/dpa", title: "Data Processing Addendum", summary: "For universities, bootcamps and employers." },
  { path: "/affiliate-disclosure", title: "Affiliate Disclosure", summary: "How partner commissions work and what partners must disclose." },
] as const;

