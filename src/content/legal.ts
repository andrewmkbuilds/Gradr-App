/**
 * Seller identity + policy content shared by the privacy, terms and refund
 * pages. Paddle's readiness check reads these pages, so they must stay
 * publicly accessible (no auth) and must name the seller and Paddle's role.
 *
 * NOTE: replace SELLER_LEGAL_NAME with the registered legal entity (or the
 * individual's full legal name) before submitting for Paddle verification.
 */
export const SELLER_LEGAL_NAME = "Gradr";
export const SELLER_CONTACT_EMAIL = "support@careerflowos.lovable.app";
export const SELLER_TRADING_NAME = "Gradr";
export const REFUND_WINDOW_DAYS = 30;
export const POLICIES_UPDATED = "2026-08-12";

export const LEGAL_PAGES = [
  { path: "/terms", label: "Terms" },
  { path: "/privacy", label: "Privacy" },
  { path: "/refund-policy", label: "Refunds" },
] as const;
