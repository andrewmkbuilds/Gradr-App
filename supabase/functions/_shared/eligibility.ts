/**
 * Provider-agnostic eligibility verification.
 *
 * The app never talks to a verification vendor directly: every provider
 * implements this small interface, so swapping SheerID for another vendor (or
 * running fully manual review) is a config change, not a rewrite.
 *
 * Privacy: we deliberately store only the provider's reference id and a
 * status. Documents, student IDs, dates of birth and any other evidence stay
 * with the provider and never touch our database.
 */

export type EligibilityStatus =
  | "pending"
  | "verified"
  | "failed"
  | "expired"
  | "revoked"
  | "manual_review";

export interface StartResult {
  /** Provider reference used to correlate the webhook back to our record. */
  referenceId: string | null;
  /** Hosted verification URL to open, when the provider has one. */
  verificationUrl: string | null;
  status: EligibilityStatus;
  provider: string;
}

export interface EligibilityProvider {
  id: string;
  /** Begin a verification for one category. */
  start(input: {
    eligibilityType: string;
    verificationId: string;
    email?: string | null;
    locale?: string | null;
  }): Promise<StartResult>;
  /** Re-read a verification from the provider (used for polling / refresh). */
  check?(referenceId: string): Promise<{ status: EligibilityStatus; reason?: string }>;
}

/** Fallback provider: creates a record an admin reviews by hand. */
export const manualProvider: EligibilityProvider = {
  id: "manual",
  start({ verificationId }) {
    return Promise.resolve({
      referenceId: verificationId,
      verificationUrl: null,
      status: "manual_review" as const,
      provider: "manual",
    });
  },
};

/** `{"student":"program_abc","military":"program_def"}` */
function sheeridPrograms(): Record<string, string> {
  const raw = Deno.env.get("SHEERID_PROGRAM_IDS");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed as Record<string, string> : {};
  } catch {
    console.error("SHEERID_PROGRAM_IDS is not valid JSON — falling back to manual review");
    return {};
  }
}

const SHEERID_API = "https://services.sheerid.com/rest/v2";

/** Map SheerID's step/state vocabulary onto our own status set. */
function mapSheeridStatus(step?: string, segment?: string): EligibilityStatus {
  const s = (step ?? segment ?? "").toLowerCase();
  if (s.includes("success") || s === "approved") return "verified";
  if (s.includes("error") || s.includes("rejected") || s.includes("failure")) return "failed";
  if (s.includes("docupload") || s.includes("review") || s.includes("pending")) return "manual_review";
  return "pending";
}

export const sheeridProvider: EligibilityProvider = {
  id: "sheerid",

  start({ eligibilityType, verificationId, email, locale }) {
    const programId = sheeridPrograms()[eligibilityType];
    if (!programId) throw new Error(`No SheerID program configured for "${eligibilityType}"`);

    // The hosted flow keeps document handling entirely on SheerID's side.
    const url = new URL(`https://services.sheerid.com/verify/${programId}/`);
    url.searchParams.set("trackingId", verificationId);
    if (email) url.searchParams.set("email", email);
    if (locale) url.searchParams.set("locale", locale);

    return Promise.resolve({
      referenceId: verificationId,
      verificationUrl: url.toString(),
      status: "pending" as const,
      provider: "sheerid",
    });
  },

  async check(referenceId: string) {
    const token = Deno.env.get("SHEERID_API_TOKEN");
    if (!token) return { status: "pending" as const };
    const res = await fetch(`${SHEERID_API}/verification/${referenceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { status: "pending" as const, reason: `provider ${res.status}` };
    const body = await res.json();
    return { status: mapSheeridStatus(body?.currentStep, body?.segment) };
  },
};

export { mapSheeridStatus };

/** Chooses SheerID when a program is configured for the category, else manual. */
export function providerFor(eligibilityType: string): EligibilityProvider {
  return sheeridPrograms()[eligibilityType] ? sheeridProvider : manualProvider;
}
