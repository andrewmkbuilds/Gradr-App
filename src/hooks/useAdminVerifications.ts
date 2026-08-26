import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adminVerificationRequestSchema, parseAdminRows } from "@/lib/admin/schemas";
import { adminRpcOrThrow, requestIdFor } from "@/lib/admin/adminRpc";

export interface AdminVerificationRequest {
  id: string;
  user_id: string;
  applicant_name: string | null;
  category: string;
  category_label: string;
  full_name: string;
  organization: string | null;
  website: string | null;
  email: string;
  personal_email: string | null;
  country: string | null;
  role_or_status: string | null;
  supporting_information: string | null;
  document_path: string | null;
  domain_matched: boolean;
  domain_proof_verified: boolean;
  fraud_score: number;
  fraud_flags: { code: string; severity: string; label: string }[] | null;
  appeal_count: number;
  latest_appeal: string | null;
  status: "pending" | "approved" | "rejected" | "needs_more_information" | "appealed";
  discount_percentage: number;
  submitted_at: string;
  reviewed_at: string | null;
  reviewer_name: string | null;
  reviewer_notes: string | null;
}

export function useAdminVerificationRequests(status: string | null) {
  return useQuery({
    queryKey: ["admin-verification-requests", status],
    queryFn: async (): Promise<AdminVerificationRequest[]> => {
      // One id per filter set, reused across react-query retries so a retried
      // fetch groups with its first attempt in the RPC audit trail.
      const data = await adminRpcOrThrow<unknown>(
        "admin_verification_requests",
        { _status: status ?? undefined, _limit: 200 },
        { requestId: requestIdFor("admin_verification_requests", status ?? "all") },
      );
      // Rows that no longer match the contract are dropped and reported
      // rather than crashing the review queue mid-render.
      return parseAdminRows(
        adminVerificationRequestSchema,
        data,
        "admin_verification_requests",
      ).rows as AdminVerificationRequest[];
    },
  });
}

export function useReviewVerificationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      requestId: string;
      decision: "approved" | "rejected" | "needs_more_information";
      notes?: string | null;
      discountPercentage?: number | null;
    }) => {
      // Routed through the edge function so the applicant also gets the
      // branded status email and the audit trail records the notification.
      const { data, error } = await supabase.functions.invoke("verification-review", {
        body: {
          requestId: input.requestId,
          decision: input.decision,
          notes: input.notes ?? undefined,
          discountPercentage:
            typeof input.discountPercentage === "number" ? input.discountPercentage : undefined,
        },
      });
      if (error) {
        let details = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx) details = (JSON.parse(await ctx.text()) as { error?: string }).error ?? details;
        } catch {
          /* keep the generic message */
        }
        throw new Error(details);
      }
      return data as { ok: boolean; emailed: boolean };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-verification-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-verification-timeline"] });
    },
  });
}

export interface InstitutionRow {
  id: string;
  name: string;
  website: string | null;
  email_domain: string;
  country: string | null;
  category: string | null;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
  created_at: string;
}

export function useInstitutions() {
  return useQuery({
    queryKey: ["verification-institutions"],
    queryFn: async (): Promise<InstitutionRow[]> => {
      const { data, error } = await supabase
        .from("verification_institutions")
        .select("id, name, website, email_domain, country, category, status, notes, created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as InstitutionRow[];
    },
  });
}

export function useSaveInstitution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      email_domain: string;
      website?: string | null;
      country?: string | null;
      category?: string | null;
      status: "pending" | "approved" | "rejected";
    }) => {
      const payload = {
        name: input.name.trim(),
        email_domain: input.email_domain.trim().toLowerCase().replace(/^.*@/, ""),
        website: input.website?.trim() || null,
        country: input.country?.trim() || null,
        category: input.category || null,
        status: input.status,
      };
      if (input.id) {
        const { error } = await supabase
          .from("verification_institutions")
          .update({ ...payload, reviewed_at: new Date().toISOString() })
          .eq("id", input.id);
        if (error) throw new Error(error.message);
        return input.id;
      }
      const { data, error } = await supabase
        .from("verification_institutions")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["verification-institutions"] });
    },
  });
}

export function useDeleteInstitution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("verification_institutions").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["verification-institutions"] });
    },
  });
}

/** Short-lived signed URL for an uploaded supporting document. */
export async function verificationDocumentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("verification-docs")
    .createSignedUrl(path, 300);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export interface AdminVerificationEvent {
  id: string;
  event: string;
  actor_role: "user" | "admin" | "system";
  actor_name: string | null;
  from_status: string | null;
  to_status: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** Every action taken on a request, including reviewer notes and timestamps. */
export function useAdminVerificationTimeline(requestId: string | null) {
  return useQuery({
    queryKey: ["admin-verification-timeline", requestId],
    enabled: Boolean(requestId),
    queryFn: async (): Promise<AdminVerificationEvent[]> => {
      const data = await adminRpcOrThrow<AdminVerificationEvent[]>(
        "admin_verification_timeline",
        { _request_id: requestId as string },
        { requestId: requestIdFor("admin_verification_timeline", requestId as string) },
      );
      return data ?? [];
    },
  });
}
