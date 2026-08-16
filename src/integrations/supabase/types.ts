export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_name: string
          id: string
          metadata: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_name: string
          id?: string
          metadata?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_name?: string
          id?: string
          metadata?: Json
          user_id?: string
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      affiliate_clicks: {
        Row: {
          affiliate_code: string
          created_at: string
          destination: string | null
          id: string
          visitor_hash: string | null
        }
        Insert: {
          affiliate_code: string
          created_at?: string
          destination?: string | null
          id?: string
          visitor_hash?: string | null
        }
        Update: {
          affiliate_code?: string
          created_at?: string
          destination?: string | null
          id?: string
          visitor_hash?: string | null
        }
        Relationships: []
      }
      ai_credits: {
        Row: {
          application_credits: number
          created_at: string
          id: string
          interview_credits: number
          updated_at: string
          user_id: string
        }
        Insert: {
          application_credits?: number
          created_at?: string
          id?: string
          interview_credits?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          application_credits?: number
          created_at?: string
          id?: string
          interview_credits?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          metadata: Json
          source: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          metadata?: Json
          source?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          metadata?: Json
          source?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          record_count: number
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          record_count?: number
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          record_count?: number
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: []
      }
      career_roadmaps: {
        Row: {
          created_at: string
          goal: string | null
          id: string
          milestones: Json
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal?: string | null
          id?: string
          milestones?: Json
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal?: string | null
          id?: string
          milestones?: Json
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cover_letters: {
        Row: {
          application_id: string | null
          content: string
          created_at: string
          id: string
          resume_id: string | null
          storage_path: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          application_id?: string | null
          content: string
          created_at?: string
          id?: string
          resume_id?: string | null
          storage_path?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          application_id?: string | null
          content?: string
          created_at?: string
          id?: string
          resume_id?: string | null
          storage_path?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cover_letters_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cover_letters_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          key: string
          rollout_percentage: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          key: string
          rollout_percentage?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          key?: string
          rollout_percentage?: number
          updated_at?: string
        }
        Relationships: []
      }
      interview_feedback: {
        Row: {
          created_at: string
          detailed_feedback: Json
          id: string
          improvements: Json
          overall_score: number | null
          session_id: string
          strengths: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          detailed_feedback?: Json
          id?: string
          improvements?: Json
          overall_score?: number | null
          session_id: string
          strengths?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          detailed_feedback?: Json
          id?: string
          improvements?: Json
          overall_score?: number | null
          session_id?: string
          strengths?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_feedback_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "interview_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          job_application_id: string | null
          started_at: string | null
          status: string
          target_role: string | null
          transcript: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          job_application_id?: string | null
          started_at?: string | null
          status?: string
          target_role?: string | null
          transcript?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          job_application_id?: string | null
          started_at?: string | null
          status?: string
          target_role?: string | null
          transcript?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_sessions_job_application_id_fkey"
            columns: ["job_application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      job_applications: {
        Row: {
          applied_at: string | null
          created_at: string
          deleted_at: string | null
          id: string
          job_id: string | null
          match_score: number | null
          next_action_at: string | null
          notes: string | null
          rationale: string | null
          resume_id: string | null
          stage: Database["public"]["Enums"]["application_stage"]
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          job_id?: string | null
          match_score?: number | null
          next_action_at?: string | null
          notes?: string | null
          rationale?: string | null
          resume_id?: string | null
          stage?: Database["public"]["Enums"]["application_stage"]
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          job_id?: string | null
          match_score?: number | null
          next_action_at?: string | null
          notes?: string | null
          rationale?: string | null
          resume_id?: string | null
          stage?: Database["public"]["Enums"]["application_stage"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          company: string | null
          company_logo_path: string | null
          created_at: string
          currency: string
          description: string | null
          expires_at: string | null
          external_id: string | null
          id: string
          is_public: boolean
          location: string | null
          published_at: string | null
          salary_max: number | null
          salary_min: number | null
          skills: string[]
          title: string
          updated_at: string
          url: string | null
          user_id: string | null
          workplace_type: string | null
        }
        Insert: {
          company?: string | null
          company_logo_path?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          expires_at?: string | null
          external_id?: string | null
          id?: string
          is_public?: boolean
          location?: string | null
          published_at?: string | null
          salary_max?: number | null
          salary_min?: number | null
          skills?: string[]
          title: string
          updated_at?: string
          url?: string | null
          user_id?: string | null
          workplace_type?: string | null
        }
        Update: {
          company?: string | null
          company_logo_path?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          expires_at?: string | null
          external_id?: string | null
          id?: string
          is_public?: boolean
          location?: string | null
          published_at?: string | null
          salary_max?: number | null
          salary_min?: number | null
          skills?: string[]
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string | null
          workplace_type?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender_id: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender_id: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          failed_at: string | null
          failure_action_url: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          paid_at: string | null
          product_code: string
          provider: string
          provider_checkout_id: string | null
          provider_event_id: string | null
          provider_invoice_id: string | null
          provider_payment_id: string | null
          purchase_kind: string
          refunded_at: string | null
          status: Database["public"]["Enums"]["payment_state"]
          subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_action_url?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          paid_at?: string | null
          product_code: string
          provider: string
          provider_checkout_id?: string | null
          provider_event_id?: string | null
          provider_invoice_id?: string | null
          provider_payment_id?: string | null
          purchase_kind: string
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["payment_state"]
          subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_action_url?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          paid_at?: string | null
          product_code?: string
          provider?: string
          provider_checkout_id?: string | null
          provider_event_id?: string | null
          provider_invoice_id?: string | null
          provider_payment_id?: string | null
          purchase_kind?: string
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["payment_state"]
          subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolios: {
        Row: {
          assets: Json
          created_at: string
          deleted_at: string | null
          id: string
          is_public: boolean
          summary: string | null
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          assets?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_public?: boolean
          summary?: string | null
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          assets?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_public?: boolean
          summary?: string | null
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          career_stage: string | null
          created_at: string
          deleted_at: string | null
          display_name: string | null
          email: string | null
          id: string
          is_onboarded: boolean
          remote_preference: string
          skills: string[]
          target_industry: string | null
          target_location: string | null
          target_role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_path?: string | null
          career_stage?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_onboarded?: boolean
          remote_preference?: string
          skills?: string[]
          target_industry?: string | null
          target_location?: string | null
          target_role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_path?: string | null
          career_stage?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_onboarded?: boolean
          remote_preference?: string
          skills?: string[]
          target_industry?: string | null
          target_location?: string | null
          target_role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      resume_versions: {
        Row: {
          change_summary: string | null
          content: Json
          created_at: string
          id: string
          label: string
          resume_id: string
          storage_path: string | null
          user_id: string
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          content?: Json
          created_at?: string
          id?: string
          label?: string
          resume_id: string
          storage_path?: string | null
          user_id: string
          version_number: number
        }
        Update: {
          change_summary?: string | null
          content?: Json
          created_at?: string
          id?: string
          label?: string
          resume_id?: string
          storage_path?: string | null
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "resume_versions_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      resumes: {
        Row: {
          analysis: Json
          ats_score: number | null
          created_at: string
          deleted_at: string | null
          file_name: string
          formatting_score: number | null
          id: string
          impact_score: number | null
          is_primary: boolean
          keyword_score: number | null
          mime_type: string
          parsed_text: string | null
          readability_score: number | null
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis?: Json
          ats_score?: number | null
          created_at?: string
          deleted_at?: string | null
          file_name: string
          formatting_score?: number | null
          id?: string
          impact_score?: number | null
          is_primary?: boolean
          keyword_score?: number | null
          mime_type: string
          parsed_text?: string | null
          readability_score?: number | null
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis?: Json
          ats_score?: number | null
          created_at?: string
          deleted_at?: string | null
          file_name?: string
          formatting_score?: number | null
          id?: string
          impact_score?: number | null
          is_primary?: boolean
          keyword_score?: number | null
          mime_type?: string
          parsed_text?: string | null
          readability_score?: number | null
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_jobs: {
        Row: {
          created_at: string
          id: string
          job_id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string
          digest_enabled: boolean
          digest_time: string
          email_notifications: boolean
          id: string
          locale: string
          push_notifications: boolean
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          digest_enabled?: boolean
          digest_time?: string
          email_notifications?: boolean
          id?: string
          locale?: string
          push_notifications?: boolean
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          digest_enabled?: boolean
          digest_time?: string
          email_notifications?: boolean
          id?: string
          locale?: string
          push_notifications?: boolean
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      skill_assessments: {
        Row: {
          created_at: string
          evidence: Json
          id: string
          proficiency: number | null
          skill_name: string
          target_proficiency: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          evidence?: Json
          id?: string
          proficiency?: number | null
          skill_name: string
          target_proficiency?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          evidence?: Json
          id?: string
          proficiency?: number | null
          skill_name?: string
          target_proficiency?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          amount_cents: number
          code: string
          created_at: string
          currency: string
          entitlement_identifier: string | null
          features: Json
          id: string
          interval: Database["public"]["Enums"]["subscription_interval"] | null
          is_active: boolean
          is_recommended: boolean
          name: string
          revenuecat_product_identifier: string | null
          stripe_lookup_key: string | null
          tier: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          code: string
          created_at?: string
          currency?: string
          entitlement_identifier?: string | null
          features?: Json
          id?: string
          interval?: Database["public"]["Enums"]["subscription_interval"] | null
          is_active?: boolean
          is_recommended?: boolean
          name: string
          revenuecat_product_identifier?: string | null
          stripe_lookup_key?: string | null
          tier: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          code?: string
          created_at?: string
          currency?: string
          entitlement_identifier?: string | null
          features?: Json
          id?: string
          interval?: Database["public"]["Enums"]["subscription_interval"] | null
          is_active?: boolean
          is_recommended?: boolean
          name?: string
          revenuecat_product_identifier?: string | null
          stripe_lookup_key?: string | null
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      thread_members: {
        Row: {
          created_at: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_members_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          created_at: string
          id: string
        }
        Insert: {
          created_at?: string
          id?: string
        }
        Update: {
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          entitlement_identifier: string
          grace_period_end: string | null
          id: string
          last_verified_at: string | null
          plan_id: string | null
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: Database["public"]["Enums"]["subscription_state"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          entitlement_identifier?: string
          grace_period_end?: string | null
          id?: string
          last_verified_at?: string | null
          plan_id?: string | null
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_state"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          entitlement_identifier?: string
          grace_period_end?: string | null
          id?: string
          last_verified_at?: string | null
          plan_id?: string | null
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_state"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: { _user_id?: string }; Returns: boolean }
      log_admin_access: {
        Args: {
          _action: string
          _details?: Json
          _record_count?: number
          _resource_id?: string
          _resource_type: string
        }
        Returns: string
      }
    }
    Enums: {
      application_stage:
        | "saved"
        | "applied"
        | "interview"
        | "offer"
        | "rejected"
        | "withdrawn"
      payment_state: "pending" | "paid" | "failed" | "refunded" | "void"
      subscription_interval: "month" | "year" | "lifetime"
      subscription_state:
        | "active"
        | "trialing"
        | "past_due"
        | "canceled"
        | "expired"
        | "none"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      application_stage: [
        "saved",
        "applied",
        "interview",
        "offer",
        "rejected",
        "withdrawn",
      ],
      payment_state: ["pending", "paid", "failed", "refunded", "void"],
      subscription_interval: ["month", "year", "lifetime"],
      subscription_state: [
        "active",
        "trialing",
        "past_due",
        "canceled",
        "expired",
        "none",
      ],
    },
  },
} as const
