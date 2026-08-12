import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adminRpc } from "@/lib/adminRpc";

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
  status: "pending" | "approved" | "rejected" | "needs_more_information";
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
      const { data, error } = await adminRpc<AdminVerificationRequest[]>("admin_verification_requests", {
        _status: status,
        _limit: 200,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as AdminVerificationRequest[];
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
      const { error } = await adminRpc("admin_review_verification_request", {
        _request_id: input.requestId,
        _decision: input.decision,
        _notes: input.notes ?? null,
        _discount_percentage: input.discountPercentage ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-verification-requests"] });
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
