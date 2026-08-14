import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type VerificationRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "needs_more_information"
  | "appealed";

export interface VerificationFraudFlag {
  code: string;
  severity: "info" | "low" | "medium" | "high";
  label: string;
}

export interface VerificationTimelineEntry {
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

export interface VerificationRequest {
  id: string;
  category: string;
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
  appeal_count: number;
  status: VerificationRequestStatus;
  discount_percentage: number;
  submitted_at: string;
  reviewed_at: string | null;
  reviewer_notes: string | null;
}

export interface SubmitVerificationInput {
  category: string;
  full_name: string;
  email: string;
  organization?: string | null;
  website?: string | null;
  personal_email?: string | null;
  country?: string | null;
  role_or_status?: string | null;
  supporting_information?: string | null;
  document_path?: string | null;
}

/** The signed-in user's own verification requests, newest first. */
export function useMyVerificationRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["verification-requests", user?.id],
    enabled: Boolean(user),
    staleTime: 15_000,
    queryFn: async (): Promise<VerificationRequest[]> => {
      const { data, error } = await supabase
        .from("verification_requests")
        .select(
          "id, category, full_name, organization, website, email, personal_email, country, role_or_status, supporting_information, document_path, domain_matched, domain_proof_verified, appeal_count, status, discount_percentage, submitted_at, reviewed_at, reviewer_notes",
        )
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VerificationRequest[];
    },
  });
}

/** Uploads an optional supporting document into the user's private folder. */
export async function uploadVerificationDocument(userId: string, file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Document must be 5 MB or smaller.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${userId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage
    .from("verification-docs")
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return path;
}

/** Submits a verification request. It always lands as "pending review". */
export function useSubmitVerificationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitVerificationInput) => {
      const { data, error } = await supabase.rpc("submit_verification_request", {
        _category: input.category,
        _full_name: input.full_name,
        _email: input.email,
        _organization: input.organization ?? undefined,
        _website: input.website ?? undefined,
        _personal_email: input.personal_email ?? undefined,
        _country: input.country ?? undefined,
        _role_or_status: input.role_or_status ?? undefined,
        _supporting_information: input.supporting_information ?? undefined,
        _document_path: input.document_path ?? undefined,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["verification-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["my-eligibility"] });
    },
  });
}

/** Asks Gradr to add an institution/domain that isn't recognised yet. */
export function useRequestInstitution() {
  return useMutation({
    mutationFn: async (input: {
      name: string;
      email_domain: string;
      website?: string | null;
      country?: string | null;
      category?: string | null;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("request_institution", {
        _name: input.name,
        _email_domain: input.email_domain,
        _website: input.website ?? undefined,
        _country: input.country ?? undefined,
        _category: input.category ?? undefined,
        _notes: input.notes ?? undefined,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
  });
}

/** Full, user-visible audit trail for one of my verification requests. */
export function useVerificationTimeline(requestId: string | null) {
  return useQuery({
    queryKey: ["verification-timeline", requestId],
    enabled: Boolean(requestId),
    staleTime: 10_000,
    queryFn: async (): Promise<VerificationTimelineEntry[]> => {
      const { data, error } = await supabase.rpc("my_verification_timeline", {
        _request_id: requestId as string,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as VerificationTimelineEntry[];
    },
  });
}

/** Appeals a rejected request with extra evidence (and an optional document). */
export function useSubmitVerificationAppeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      requestId: string;
      message: string;
      documentPath?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("submit_verification_appeal", {
        _request_id: input.requestId,
        _message: input.message,
        _document_path: input.documentPath ?? undefined,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["verification-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["verification-timeline"] });
    },
  });
}

/** Has this account already proven it can receive mail at `email`? */
export async function checkDomainProof(email: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke("verify-academic-email", {
    body: { action: "proof_status", email },
  });
  if (error) return false;
  return Boolean((data as { proven?: boolean } | null)?.proven);
}
