/**
 * Runtime contracts for admin data.
 *
 * Admin screens read wide, fast-moving tables (affiliates, verification
 * requests, discounts). When the database drifts ahead of the generated
 * types — a renamed column, a nullable field that used to be required — the
 * UI would previously blow up mid-render on the whole page.
 *
 * These schemas validate rows at the query boundary instead:
 *   - rows that parse are returned, typed and normalised
 *   - rows that don't are dropped and reported to Sentry with the field paths
 *   - the screen keeps rendering with whatever is still valid
 *
 * Schemas ignore EXTRA columns (a new column is not a breaking change) and
 * describe exactly the fields the UI reads. Display strings normalise to ""
 * so a suddenly-null column renders blank instead of throwing.
 */
import { z } from "zod";
import { addBreadcrumb, captureError } from "@/lib/telemetry/sentry";

const iso = z.string();
const nullableIso = z.string().nullish().catch(null).transform((v) => v ?? null);
/** Display string: never null at the UI, so `.toLowerCase()` etc. stay safe. */
const text = z.coerce.string().nullish().catch(null).transform((v) => v ?? "");
const nullableNumber = z.coerce.number().nullish().catch(null).transform((v) => v ?? null);

/** `affiliate_applications` rows shown in the applications queue. */
export const affiliateApplicationSchema = z.object({
  id: z.string(),
  status: z.string().catch("pending"),
  full_name: text,
  email: text,
  brand_name: text,
  website: text,
  audience_size: text,
  promotion_plan: text,
  admin_notes: text,
  rejection_reason: text,
  created_at: nullableIso,
  reviewed_date: nullableIso,
});

/** `affiliate_profiles` rows shown in the affiliates table. */
export const affiliateProfileSchema = z.object({
  id: z.string(),
  user_id: text,
  affiliate_code: text,
  status: z.string().catch("active"),
  custom_commission_rate: nullableNumber,
  tier_id: z.string().nullish().catch(null).transform((v) => v ?? null),
  approval_date: nullableIso,
});

/** `affiliate_commissions` joined with the owning profile's code. */
export const affiliateCommissionSchema = z.object({
  id: z.string(),
  status: z.string().catch("pending"),
  commission_amount: nullableNumber,
  source_amount: nullableNumber,
  currency: text,
  conversion_type: text,
  created_date: nullableIso,
  affiliate_profiles: z.object({ affiliate_code: text }).nullish().catch(null).transform((v) => v ?? null),
});

/** `affiliate_tiers` — commission ladder shown in settings. */
export const affiliateTierSchema = z.object({
  id: z.string(),
  key: z.string().catch(""),
  name: z.string().catch("Tier"),
  min_referrals: z.coerce.number().catch(0),
  bonus_rate: z.coerce.number().catch(0),
  color: z.string().catch("#245F73"),
  perks: text,
  sort_order: z.coerce.number().catch(0),
  active: z.boolean().catch(true),
});

/** Result rows of the `admin_verification_requests` RPC. */
export const adminVerificationRequestSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  applicant_name: text,
  category: z.string().catch("unknown"),
  category_label: z.string().catch("Unknown"),
  full_name: z.string().catch(""),
  organization: text,
  website: text,
  email: z.string().catch(""),
  personal_email: text,
  country: text,
  role_or_status: text,
  supporting_information: text,
  document_path: text,
  domain_matched: z.boolean().catch(false),
  domain_proof_verified: z.boolean().catch(false),
  fraud_score: z.coerce.number().catch(0),
  fraud_flags: z
    .array(z.object({ code: z.string(), severity: z.string(), label: z.string() }))
    .nullish()
    .catch(null)
    .transform((v) => v ?? null),
  appeal_count: z.coerce.number().catch(0),
  latest_appeal: text,
  status: z
    .enum(["pending", "approved", "rejected", "needs_more_information", "appealed"])
    .catch("pending"),
  discount_percentage: z.coerce.number().catch(0),
  submitted_at: iso.catch(() => new Date().toISOString()),
  reviewed_at: nullableIso,
  reviewer_name: text,
  reviewer_notes: text,
});

/** `discount_rules` rows in the discounts admin. */
export const discountRuleSchema = z.object({
  id: z.string(),
  name: text,
  eligibility_type: z.string().catch("unknown"),
  percentage: z.coerce.number().catch(0),
  is_active: z.boolean().catch(true),
  starts_at: nullableIso,
  ends_at: nullableIso,
  created_at: nullableIso,
});

export type AffiliateApplicationRow = z.infer<typeof affiliateApplicationSchema>;
export type AffiliateProfileRow = z.infer<typeof affiliateProfileSchema>;
export type AffiliateCommissionRow = z.infer<typeof affiliateCommissionSchema>;
export type AffiliateTierRow = z.infer<typeof affiliateTierSchema>;
export type AdminVerificationRequestRow = z.infer<typeof adminVerificationRequestSchema>;
export type DiscountRuleRow = z.infer<typeof discountRuleSchema>;

/** How many bad rows we describe in one report before truncating. */
const MAX_REPORTED_ISSUES = 5;

export interface SchemaDriftSummary {
  /** Number of rows that failed validation and were dropped. */
  dropped: number;
  /** `row[3].status: expected string` style descriptions, truncated. */
  issues: string[];
}

/**
 * Validates a list of rows, dropping (and reporting) the ones that don't
 * match. Never throws — a drifting column degrades one row, not the screen.
 */
export function parseAdminRows<T extends z.ZodTypeAny>(
  schema: T,
  rows: unknown,
  context: string,
): { rows: z.infer<T>[]; drift: SchemaDriftSummary | null } {
  if (!Array.isArray(rows)) {
    if (rows != null) reportDrift(context, [`expected an array, received ${typeof rows}`], 1);
    return { rows: [], drift: rows == null ? null : { dropped: 1, issues: ["not an array"] } };
  }

  const parsed: z.infer<T>[] = [];
  const issues: string[] = [];

  rows.forEach((row, index) => {
    const result = schema.safeParse(row);
    if (result.success) {
      parsed.push(result.data);
      return;
    }
    if (issues.length < MAX_REPORTED_ISSUES) {
      for (const issue of result.error.issues.slice(0, 3)) {
        issues.push(`row[${index}].${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
    }
  });

  const dropped = rows.length - parsed.length;
  if (dropped > 0) reportDrift(context, issues, dropped);

  return { rows: parsed, drift: dropped > 0 ? { dropped, issues } : null };
}

/** Same contract for a single row (RPCs that return one object). */
export function parseAdminRow<T extends z.ZodTypeAny>(
  schema: T,
  row: unknown,
  context: string,
): z.infer<T> | null {
  const result = schema.safeParse(row);
  if (result.success) return result.data;
  reportDrift(
    context,
    result.error.issues.slice(0, MAX_REPORTED_ISSUES).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    1,
  );
  return null;
}

function reportDrift(context: string, issues: string[], dropped: number) {
  const message = `Schema drift in ${context}: ${dropped} row(s) dropped`;
  // Field paths and messages only — never row values, which can be PII.
  console.warn(message, issues);
  addBreadcrumb("schema", message, { issues: issues.join("; ") });
  captureError(new Error(message), { source: context, issues, dropped });
}
