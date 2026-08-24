/**
 * Gradr "Yacht Club" email design tokens.
 * Email clients require literal hex + inline styles — no CSS variables.
 */
export const brand = {
  teal: '#245F73',
  tealDark: '#1A4757',
  tealSoft: '#E7EEF1',
  tealBorder: '#C3D6DD',
  mahogany: '#733E24',
  mahoganyDark: '#5A2F1B',
  mahoganySoft: '#F5EAE4',
  mahoganyBorder: '#E2C9BB',
  offWhite: '#F2F0EF',
  coolGray: '#BBBDBC',
  ink: '#161A1C',
  body: '#4B5457',
  muted: '#767F82',
  hairline: '#E3E1E0',
  white: '#FFFFFF',
  success: '#2E6B4F',
  successSoft: '#E7F1EC',
  warning: '#8A5A12',
  warningSoft: '#FAF0DE',
  danger: '#8C2F26',
  dangerSoft: '#F8E9E7',
} as const

export const fontStack =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif"

export const displayStack =
  "Georgia, 'Times New Roman', 'Segoe UI', Helvetica, Arial, sans-serif"

export const SITE_URL = 'https://gradr.me'
/** Authenticated product surface. Never link signed-in destinations at the apex. */
export const APP_URL = 'https://app.gradr.me'
// Email images MUST be immutable, public, unauthenticated HTTPS URLs: Gmail
// fetches them through its own proxy with no cookies and no session. This points
// at the CDN asset (content-addressed by id), not at /public/*, so a frontend
// deploy or file rename can never break already-delivered mail.
export const LOGO_URL =
  'https://gradr.me/__l5e/assets-v1/adf77cc0-3a55-4a03-98ba-9db489f75c22/gradr-email-logo-144.png'
export const SUPPORT_EMAIL = 'support@gradr.me'

/** Append UTM params so email traffic is attributable in analytics. */
export function link(path: string, campaign: string): string {
  const base = path.startsWith('http') ? path : `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}utm_source=email&utm_medium=lifecycle&utm_campaign=${encodeURIComponent(campaign)}`
}

/**
 * Link to a signed-in destination. Those routes only exist on the application
 * surface, so they must never be built off the apex marketing host — a
 * `gradr.me/settings` link 404s for the recipient.
 */
export function appLink(path: string, campaign: string): string {
  const base = `${APP_URL}${path.startsWith('/') ? path : `/${path}`}`
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}utm_source=email&utm_medium=lifecycle&utm_campaign=${encodeURIComponent(campaign)}`
}

export type Tone = 'teal' | 'mahogany' | 'success' | 'warning' | 'danger' | 'neutral'

export const tonePalette: Record<Tone, { fg: string; bg: string; border: string }> = {
  teal: { fg: brand.teal, bg: brand.tealSoft, border: brand.tealBorder },
  mahogany: { fg: brand.mahogany, bg: brand.mahoganySoft, border: brand.mahoganyBorder },
  success: { fg: brand.success, bg: brand.successSoft, border: '#C4DED2' },
  warning: { fg: brand.warning, bg: brand.warningSoft, border: '#EBD6AE' },
  danger: { fg: brand.danger, bg: brand.dangerSoft, border: '#EDC9C4' },
  neutral: { fg: brand.body, bg: brand.offWhite, border: brand.hairline },
}
