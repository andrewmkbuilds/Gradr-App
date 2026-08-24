/**
 * Business identity and contact details shown on legal and contact surfaces.
 *
 * RULE: never invent a value here. Anything the business owner has not
 * supplied stays `null`, and the UI renders an obvious placeholder marker
 * instead of a made-up company name, address, registration number or tax id.
 * `pendingIdentityFields()` powers the launch checklist so unset values are
 * visible rather than silently missing.
 */
import { SELLER_CONTACT_EMAIL, SELLER_LEGAL_NAME } from "./legal";

/** Rendered wherever an unknown legal fact would otherwise appear. */
export const PLACEHOLDER = "[TO BE PROVIDED BY GRADR]";

export interface CompanyIdentity {
  /** Registered legal entity name, e.g. "Gradr FZ-LLC". Null until verified. */
  legalEntityName: string | null;
  /** Entity type/form, e.g. sole establishment, FZ-LLC, Ltd. */
  entityType: string | null;
  /** Full registered address, one line per element. */
  registeredAddress: string[] | null;
  /** Company/commercial registration or trade licence number. */
  registrationNumber: string | null;
  /** Authority that issued the registration (e.g. a UAE free zone authority). */
  registrationAuthority: string | null;
  /** VAT / TRN / tax registration number, where the business is registered. */
  taxNumber: string | null;
  /** Governing law and courts stated in the Terms. */
  governingLaw: string | null;
  /** Named data protection contact or DPO, where one is appointed. */
  dataProtectionContact: string | null;
  /** EU / UK Article 27 representative, where one is required. */
  euRepresentative: string | null;
  ukRepresentative: string | null;
  /** Supervisory authority a user can complain to, if the owner confirms one. */
  supervisoryAuthority: string | null;
  /** Public support phone, if the business offers one. */
  supportPhone: string | null;
}

/**
 * Live values. Everything is null until the owner supplies verified details —
 * see the "Owner input required" section of the launch checklist.
 */
export const COMPANY: CompanyIdentity = {
  legalEntityName: null,
  entityType: null,
  registeredAddress: null,
  registrationNumber: null,
  registrationAuthority: null,
  taxNumber: null,
  governingLaw: null,
  dataProtectionContact: null,
  euRepresentative: null,
  ukRepresentative: null,
  supervisoryAuthority: null,
  supportPhone: null,
};

/** Contact addresses. These route to a real, monitored inbox. */
export const SUPPORT_CONTACT_EMAIL = SELLER_CONTACT_EMAIL;
export const PRIVACY_CONTACT_EMAIL = "privacy@gradr.me";
export const LEGAL_CONTACT_EMAIL = "legal@gradr.me";
export const SECURITY_CONTACT_EMAIL = "security@gradr.me";
export const BILLING_CONTACT_EMAIL = "billing@gradr.me";

/** Display helper: the supplied value, or a clearly marked placeholder. */
export function identityValue(value: string | null): string {
  return value?.trim() || PLACEHOLDER;
}

/** The trading name is known; the registered entity may not be. */
export function displayEntityName(): string {
  return COMPANY.legalEntityName || SELLER_LEGAL_NAME;
}

/** True while the registered entity has not been supplied. */
export function identityIncomplete(): boolean {
  return pendingIdentityFields().length > 0;
}

const FIELD_LABELS: Record<keyof CompanyIdentity, string> = {
  legalEntityName: "Registered legal entity name",
  entityType: "Entity type (LLC, FZ-LLC, sole establishment, Ltd…)",
  registeredAddress: "Registered business address",
  registrationNumber: "Company / trade licence number",
  registrationAuthority: "Issuing registration authority",
  taxNumber: "VAT / TRN / tax registration number",
  governingLaw: "Governing law and courts",
  dataProtectionContact: "Data protection contact or DPO",
  euRepresentative: "EU Article 27 representative (if EU users)",
  ukRepresentative: "UK Article 27 representative (if UK users)",
  supervisoryAuthority: "Lead supervisory / data protection authority",
  supportPhone: "Public support phone number (optional)",
};

/** Human-readable list of identity facts still missing. */
export function pendingIdentityFields(): { key: keyof CompanyIdentity; label: string }[] {
  return (Object.keys(FIELD_LABELS) as (keyof CompanyIdentity)[])
    .filter((key) => {
      const value = COMPANY[key];
      return Array.isArray(value) ? value.length === 0 : !value;
    })
    .map((key) => ({ key, label: FIELD_LABELS[key] }));
}
