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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      admin_audit_log: {
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
      affiliate_applications: {
        Row: {
          admin_notes: string | null
          agreed_to_terms: boolean
          audience_size: string | null
          audience_type: string | null
          brand_name: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          payout_details: Json
          promotion_plan: string | null
          reviewed_by: string | null
          reviewed_date: string | null
          social_links: Json
          status: Database["public"]["Enums"]["affiliate_application_status"]
          updated_at: string
          user_id: string
          website: string | null
          why_join: string | null
        }
        Insert: {
          admin_notes?: string | null
          agreed_to_terms?: boolean
          audience_size?: string | null
          audience_type?: string | null
          brand_name?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          payout_details?: Json
          promotion_plan?: string | null
          reviewed_by?: string | null
          reviewed_date?: string | null
          social_links?: Json
          status?: Database["public"]["Enums"]["affiliate_application_status"]
          updated_at?: string
          user_id: string
          website?: string | null
          why_join?: string | null
        }
        Update: {
          admin_notes?: string | null
          agreed_to_terms?: boolean
          audience_size?: string | null
          audience_type?: string | null
          brand_name?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          payout_details?: Json
          promotion_plan?: string | null
          reviewed_by?: string | null
          reviewed_date?: string | null
          social_links?: Json
          status?: Database["public"]["Enums"]["affiliate_application_status"]
          updated_at?: string
          user_id?: string
          website?: string | null
          why_join?: string | null
        }
        Relationships: []
      }
      affiliate_campaigns: {
        Row: {
          affiliate_profile_id: string
          click_count: number
          created_at: string
          id: string
          landing_path: string
          name: string
          notes: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          affiliate_profile_id: string
          click_count?: number
          created_at?: string
          id?: string
          landing_path?: string
          name: string
          notes?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          affiliate_profile_id?: string
          click_count?: number
          created_at?: string
          id?: string
          landing_path?: string
          name?: string
          notes?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_campaigns_affiliate_profile_id_fkey"
            columns: ["affiliate_profile_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_clicks: {
        Row: {
          affiliate_code: string
          affiliate_profile_id: string | null
          clicked_at: string
          id: string
          ip_hash: string | null
          landing_page: string | null
          session_id: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_key: string | null
        }
        Insert: {
          affiliate_code: string
          affiliate_profile_id?: string | null
          clicked_at?: string
          id?: string
          ip_hash?: string | null
          landing_page?: string | null
          session_id?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_key?: string | null
        }
        Update: {
          affiliate_code?: string
          affiliate_profile_id?: string | null
          clicked_at?: string
          id?: string
          ip_hash?: string | null
          landing_page?: string | null
          session_id?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_clicks_affiliate_profile_id_fkey"
            columns: ["affiliate_profile_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_commissions: {
        Row: {
          affiliate_profile_id: string
          affiliate_referral_id: string | null
          approved_date: string | null
          commission_amount: number
          commission_rate: number
          commission_type: Database["public"]["Enums"]["affiliate_commission_type"]
          created_at: string
          created_date: string
          id: string
          notes: string | null
          paid_date: string | null
          reversed_date: string | null
          source_amount: number | null
          status: Database["public"]["Enums"]["affiliate_commission_status"]
          updated_at: string
        }
        Insert: {
          affiliate_profile_id: string
          affiliate_referral_id?: string | null
          approved_date?: string | null
          commission_amount: number
          commission_rate: number
          commission_type: Database["public"]["Enums"]["affiliate_commission_type"]
          created_at?: string
          created_date?: string
          id?: string
          notes?: string | null
          paid_date?: string | null
          reversed_date?: string | null
          source_amount?: number | null
          status?: Database["public"]["Enums"]["affiliate_commission_status"]
          updated_at?: string
        }
        Update: {
          affiliate_profile_id?: string
          affiliate_referral_id?: string | null
          approved_date?: string | null
          commission_amount?: number
          commission_rate?: number
          commission_type?: Database["public"]["Enums"]["affiliate_commission_type"]
          created_at?: string
          created_date?: string
          id?: string
          notes?: string | null
          paid_date?: string | null
          reversed_date?: string | null
          source_amount?: number | null
          status?: Database["public"]["Enums"]["affiliate_commission_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_commissions_affiliate_profile_id_fkey"
            columns: ["affiliate_profile_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_affiliate_referral_id_fkey"
            columns: ["affiliate_referral_id"]
            isOneToOne: false
            referencedRelation: "affiliate_referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_payouts: {
        Row: {
          affiliate_profile_id: string
          amount: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payout_date: string | null
          payout_method: string | null
          payout_reference: string | null
          reference: string | null
          status: Database["public"]["Enums"]["affiliate_payout_status"]
          updated_at: string
        }
        Insert: {
          affiliate_profile_id: string
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payout_date?: string | null
          payout_method?: string | null
          payout_reference?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["affiliate_payout_status"]
          updated_at?: string
        }
        Update: {
          affiliate_profile_id?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payout_date?: string | null
          payout_method?: string | null
          payout_reference?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["affiliate_payout_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payouts_affiliate_profile_id_fkey"
            columns: ["affiliate_profile_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_profiles: {
        Row: {
          affiliate_code: string
          approval_date: string
          created_at: string
          custom_commission_rate: number | null
          default_commission_type:
            | Database["public"]["Enums"]["affiliate_commission_type"]
            | null
          id: string
          notes: string | null
          payout_email: string | null
          payout_method: string | null
          status: Database["public"]["Enums"]["affiliate_profile_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          affiliate_code: string
          approval_date?: string
          created_at?: string
          custom_commission_rate?: number | null
          default_commission_type?:
            | Database["public"]["Enums"]["affiliate_commission_type"]
            | null
          id?: string
          notes?: string | null
          payout_email?: string | null
          payout_method?: string | null
          status?: Database["public"]["Enums"]["affiliate_profile_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          affiliate_code?: string
          approval_date?: string
          created_at?: string
          custom_commission_rate?: number | null
          default_commission_type?:
            | Database["public"]["Enums"]["affiliate_commission_type"]
            | null
          id?: string
          notes?: string | null
          payout_email?: string | null
          payout_method?: string | null
          status?: Database["public"]["Enums"]["affiliate_profile_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      affiliate_referrals: {
        Row: {
          affiliate_click_id: string | null
          affiliate_profile_id: string
          attribution_status: Database["public"]["Enums"]["affiliate_referral_status"]
          conversion_date: string | null
          conversion_type:
            | Database["public"]["Enums"]["affiliate_conversion_type"]
            | null
          created_at: string
          id: string
          notes: string | null
          referral_code: string
          referred_user_id: string
          signup_date: string
          source_record_id: string | null
          updated_at: string
        }
        Insert: {
          affiliate_click_id?: string | null
          affiliate_profile_id: string
          attribution_status?: Database["public"]["Enums"]["affiliate_referral_status"]
          conversion_date?: string | null
          conversion_type?:
            | Database["public"]["Enums"]["affiliate_conversion_type"]
            | null
          created_at?: string
          id?: string
          notes?: string | null
          referral_code: string
          referred_user_id: string
          signup_date?: string
          source_record_id?: string | null
          updated_at?: string
        }
        Update: {
          affiliate_click_id?: string | null
          affiliate_profile_id?: string
          attribution_status?: Database["public"]["Enums"]["affiliate_referral_status"]
          conversion_date?: string | null
          conversion_type?:
            | Database["public"]["Enums"]["affiliate_conversion_type"]
            | null
          created_at?: string
          id?: string
          notes?: string | null
          referral_code?: string
          referred_user_id?: string
          signup_date?: string
          source_record_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_referrals_affiliate_click_id_fkey"
            columns: ["affiliate_click_id"]
            isOneToOne: false
            referencedRelation: "affiliate_clicks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_referrals_affiliate_profile_id_fkey"
            columns: ["affiliate_profile_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_settings: {
        Row: {
          affiliate_terms: string
          auto_approve: boolean
          cookie_duration_days: number
          created_at: string
          default_commission_rate: number
          default_commission_type: Database["public"]["Enums"]["affiliate_commission_type"]
          id: number
          last_touch_attribution_enabled: boolean
          minimum_payout_threshold: number
          payout_instructions: string
          program_enabled: boolean
          updated_at: string
        }
        Insert: {
          affiliate_terms?: string
          auto_approve?: boolean
          cookie_duration_days?: number
          created_at?: string
          default_commission_rate?: number
          default_commission_type?: Database["public"]["Enums"]["affiliate_commission_type"]
          id?: number
          last_touch_attribution_enabled?: boolean
          minimum_payout_threshold?: number
          payout_instructions?: string
          program_enabled?: boolean
          updated_at?: string
        }
        Update: {
          affiliate_terms?: string
          auto_approve?: boolean
          cookie_duration_days?: number
          created_at?: string
          default_commission_rate?: number
          default_commission_type?: Database["public"]["Enums"]["affiliate_commission_type"]
          id?: number
          last_touch_attribution_enabled?: boolean
          minimum_payout_threshold?: number
          payout_instructions?: string
          program_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          article: string | null
          created_at: string
          destination: string | null
          event_name: string
          id: string
          location: string | null
          metadata: Json
          path: string | null
          referrer: string | null
          session_id: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          article?: string | null
          created_at?: string
          destination?: string | null
          event_name: string
          id?: string
          location?: string | null
          metadata?: Json
          path?: string | null
          referrer?: string | null
          session_id?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          article?: string | null
          created_at?: string
          destination?: string | null
          event_name?: string
          id?: string
          location?: string | null
          metadata?: Json
          path?: string | null
          referrer?: string | null
          session_id?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      digest_send_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          jobs_count: number
          preview: Json
          reminders_count: number
          sent_at: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          jobs_count?: number
          preview?: Json
          reminders_count?: number
          sent_at?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          jobs_count?: number
          preview?: Json
          reminders_count?: number
          sent_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      job_matches: {
        Row: {
          ai_strategy: string | null
          company: string | null
          created_at: string
          description: string | null
          id: string
          job_title: string
          location: string | null
          match_score: number | null
          matched_skills: string[] | null
          missing_skills: string[] | null
          salary_range: string | null
          user_id: string
        }
        Insert: {
          ai_strategy?: string | null
          company?: string | null
          created_at?: string
          description?: string | null
          id?: string
          job_title: string
          location?: string | null
          match_score?: number | null
          matched_skills?: string[] | null
          missing_skills?: string[] | null
          salary_range?: string | null
          user_id: string
        }
        Update: {
          ai_strategy?: string | null
          company?: string | null
          created_at?: string
          description?: string | null
          id?: string
          job_title?: string
          location?: string | null
          match_score?: number | null
          matched_skills?: string[] | null
          missing_skills?: string[] | null
          salary_range?: string | null
          user_id?: string
        }
        Relationships: []
      }
      job_reminders: {
        Row: {
          created_at: string
          done: boolean
          due_at: string
          id: string
          title: string
          tracked_job_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          due_at: string
          id?: string
          title: string
          tracked_job_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          done?: boolean
          due_at?: string
          id?: string
          title?: string
          tracked_job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_reminders_tracked_job_id_fkey"
            columns: ["tracked_job_id"]
            isOneToOne: false
            referencedRelation: "tracked_jobs"
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
          metadata: Json | null
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
          metadata?: Json | null
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
          metadata?: Json | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          career_stage: string | null
          created_at: string
          display_name: string | null
          id: string
          skills: string[] | null
          target_industry: string | null
          target_job_title: string | null
          target_salary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          career_stage?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          skills?: string[] | null
          target_industry?: string | null
          target_job_title?: string | null
          target_salary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          career_stage?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          skills?: string[] | null
          target_industry?: string | null
          target_job_title?: string | null
          target_salary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          amount_total: number
          created_at: string
          credits_granted: number
          currency: string
          id: string
          pack_key: string
          pack_label: string | null
          quantity: number
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_total?: number
          created_at?: string
          credits_granted?: number
          currency?: string
          id?: string
          pack_key: string
          pack_label?: string | null
          quantity?: number
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_total?: number
          created_at?: string
          credits_granted?: number
          currency?: string
          id?: string
          pack_key?: string
          pack_label?: string | null
          quantity?: number
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      resumes: {
        Row: {
          ai_suggestions: Json | null
          ats_score: number | null
          created_at: string
          file_name: string
          file_path: string
          file_type: string
          formatting_score: number | null
          id: string
          impact_score: number | null
          keyword_match: number | null
          parsed_text: string | null
          readability_score: number | null
          updated_at: string
          user_id: string
          version_label: string | null
        }
        Insert: {
          ai_suggestions?: Json | null
          ats_score?: number | null
          created_at?: string
          file_name: string
          file_path: string
          file_type: string
          formatting_score?: number | null
          id?: string
          impact_score?: number | null
          keyword_match?: number | null
          parsed_text?: string | null
          readability_score?: number | null
          updated_at?: string
          user_id: string
          version_label?: string | null
        }
        Update: {
          ai_suggestions?: Json | null
          ats_score?: number | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_type?: string
          formatting_score?: number | null
          id?: string
          impact_score?: number | null
          keyword_match?: number | null
          parsed_text?: string | null
          readability_score?: number | null
          updated_at?: string
          user_id?: string
          version_label?: string | null
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          billing_interval: string | null
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          email: string
          id: string
          price_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscribed: boolean
          subscription_status: string | null
          subscription_tier: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          email: string
          id?: string
          price_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscribed?: boolean
          subscription_status?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          email?: string
          id?: string
          price_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscribed?: boolean
          subscription_status?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tracked_jobs: {
        Row: {
          application_pack: Json | null
          applied_at: string | null
          company: string | null
          created_at: string
          description: string | null
          external_id: string | null
          id: string
          location: string | null
          match_score: number | null
          notes: string | null
          position: number | null
          posted_at: string | null
          remote: boolean | null
          salary_max: number | null
          salary_min: number | null
          source: string | null
          status: string
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          application_pack?: Json | null
          applied_at?: string | null
          company?: string | null
          created_at?: string
          description?: string | null
          external_id?: string | null
          id?: string
          location?: string | null
          match_score?: number | null
          notes?: string | null
          position?: number | null
          posted_at?: string | null
          remote?: boolean | null
          salary_max?: number | null
          salary_min?: number | null
          source?: string | null
          status?: string
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          application_pack?: Json | null
          applied_at?: string | null
          company?: string | null
          created_at?: string
          description?: string | null
          external_id?: string | null
          id?: string
          location?: string | null
          match_score?: number | null
          notes?: string | null
          position?: number | null
          posted_at?: string | null
          remote?: boolean | null
          salary_max?: number | null
          salary_min?: number | null
          source?: string | null
          status?: string
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      usage_credits: {
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
      user_preferences: {
        Row: {
          country: string | null
          created_at: string
          digest_enabled: boolean
          digest_send_time: string
          digest_timezone: string
          experience_level: string | null
          id: string
          keywords: string[] | null
          locations: string[] | null
          onboarded: boolean
          remote_preference: string | null
          salary_min: number | null
          target_role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          digest_enabled?: boolean
          digest_send_time?: string
          digest_timezone?: string
          experience_level?: string | null
          id?: string
          keywords?: string[] | null
          locations?: string[] | null
          onboarded?: boolean
          remote_preference?: string | null
          salary_min?: number | null
          target_role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          country?: string | null
          created_at?: string
          digest_enabled?: boolean
          digest_send_time?: string
          digest_timezone?: string
          experience_level?: string | null
          id?: string
          keywords?: string[] | null
          locations?: string[] | null
          onboarded?: boolean
          remote_preference?: string | null
          salary_min?: number | null
          target_role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_audit_actors: {
        Args: never
        Returns: {
          display_name: string
          user_id: string
        }[]
      }
      admin_create_payout: {
        Args: {
          _affiliate_profile_id: string
          _amount: number
          _commission_ids?: string[]
          _notes?: string
          _payout_method: string
          _reference?: string
        }
        Returns: string
      }
      admin_mark_payout_paid: {
        Args: {
          _payout_id: string
          _payout_method?: string
          _reference?: string
        }
        Returns: undefined
      }
      affiliate_click_is_valid: {
        Args: { _code: string; _profile_id: string }
        Returns: boolean
      }
      approve_affiliate_application: {
        Args: { _application_id: string }
        Returns: string
      }
      assert_admin_write_rate_limit: {
        Args: { _actor: string; _limit?: number }
        Returns: undefined
      }
      attribute_signup_referral: {
        Args: { _click_id?: string; _code: string }
        Returns: string
      }
      enqueue_notification: {
        Args: {
          _body?: string
          _link?: string
          _metadata?: Json
          _title: string
          _type: string
          _user_id: string
        }
        Returns: string
      }
      generate_affiliate_code: { Args: never; Returns: string }
      get_affiliate_public_settings: {
        Args: never
        Returns: {
          affiliate_terms: string
          cookie_duration_days: number
          default_commission_rate: number
          default_commission_type: Database["public"]["Enums"]["affiliate_commission_type"]
          minimum_payout_threshold: number
          program_enabled: boolean
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
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
      lookup_affiliate_by_code: {
        Args: { _code: string }
        Returns: {
          code: string
          is_active: boolean
          profile_id: string
        }[]
      }
      notify_admins: {
        Args: {
          _body?: string
          _link?: string
          _metadata?: Json
          _title: string
          _type: string
        }
        Returns: number
      }
      record_conversion_commission: {
        Args: {
          _conversion_type?: Database["public"]["Enums"]["affiliate_conversion_type"]
          _referred_user_id: string
          _source_amount: number
          _source_record_id?: string
        }
        Returns: string
      }
      reject_affiliate_application: {
        Args: { _application_id: string; _reason?: string }
        Returns: undefined
      }
    }
    Enums: {
      affiliate_application_status:
        | "pending"
        | "approved"
        | "rejected"
        | "suspended"
      affiliate_commission_status:
        | "pending"
        | "approved"
        | "paid"
        | "reversed"
        | "canceled"
      affiliate_commission_type: "percentage" | "flat"
      affiliate_conversion_type: "signup" | "paid_upgrade" | "custom"
      affiliate_payout_status: "pending" | "paid" | "failed" | "canceled"
      affiliate_profile_status: "active" | "suspended" | "revoked"
      affiliate_referral_status: "pending" | "confirmed" | "rejected"
      app_role: "admin" | "user"
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
      affiliate_application_status: [
        "pending",
        "approved",
        "rejected",
        "suspended",
      ],
      affiliate_commission_status: [
        "pending",
        "approved",
        "paid",
        "reversed",
        "canceled",
      ],
      affiliate_commission_type: ["percentage", "flat"],
      affiliate_conversion_type: ["signup", "paid_upgrade", "custom"],
      affiliate_payout_status: ["pending", "paid", "failed", "canceled"],
      affiliate_profile_status: ["active", "suspended", "revoked"],
      affiliate_referral_status: ["pending", "confirmed", "rejected"],
      app_role: ["admin", "user"],
    },
  },
} as const
