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
          rejection_reason: string | null
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
          rejection_reason?: string | null
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
          rejection_reason?: string | null
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
          source_record_id: string | null
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
          source_record_id?: string | null
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
          source_record_id?: string | null
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
      affiliate_tiers: {
        Row: {
          active: boolean
          bonus_rate: number
          color: string
          created_at: string
          id: string
          key: string
          min_referrals: number
          name: string
          perks: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          bonus_rate?: number
          color?: string
          created_at?: string
          id?: string
          key: string
          min_referrals?: number
          name: string
          perks?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          bonus_rate?: number
          color?: string
          created_at?: string
          id?: string
          key?: string
          min_referrals?: number
          name?: string
          perks?: string | null
          sort_order?: number
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
      company_research: {
        Row: {
          cache_key: string
          company: string
          created_at: string
          id: string
          payload: Json
          provider: string
          role: string | null
          sources: Json
        }
        Insert: {
          cache_key: string
          company: string
          created_at?: string
          id?: string
          payload: Json
          provider: string
          role?: string | null
          sources?: Json
        }
        Update: {
          cache_key?: string
          company?: string
          created_at?: string
          id?: string
          payload?: Json
          provider?: string
          role?: string | null
          sources?: Json
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
      discount_redemptions: {
        Row: {
          created_at: string
          currency: string | null
          discount_amount: number | null
          discount_rule_id: string | null
          eligibility_type: string | null
          environment: string
          gross_amount: number | null
          id: string
          interval: string | null
          net_amount: number | null
          percentage: number
          plan: string | null
          subscription_id: string | null
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          discount_amount?: number | null
          discount_rule_id?: string | null
          eligibility_type?: string | null
          environment?: string
          gross_amount?: number | null
          id?: string
          interval?: string | null
          net_amount?: number | null
          percentage: number
          plan?: string | null
          subscription_id?: string | null
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          discount_amount?: number | null
          discount_rule_id?: string | null
          eligibility_type?: string | null
          environment?: string
          gross_amount?: number | null
          id?: string
          interval?: string | null
          net_amount?: number | null
          percentage?: number
          plan?: string | null
          subscription_id?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_redemptions_discount_rule_id_fkey"
            columns: ["discount_rule_id"]
            isOneToOne: false
            referencedRelation: "discount_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_rules: {
        Row: {
          active: boolean
          advertised: boolean
          applicable_intervals: string[]
          applicable_plans: string[]
          created_at: string
          created_by: string | null
          eligibility_type: string | null
          ends_at: string | null
          id: string
          kind: string
          max_redemptions: number | null
          name: string
          organization_id: string | null
          percentage: number
          redemption_count: number
          requires_verification: boolean
          stackable: boolean
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          advertised?: boolean
          applicable_intervals?: string[]
          applicable_plans?: string[]
          created_at?: string
          created_by?: string | null
          eligibility_type?: string | null
          ends_at?: string | null
          id?: string
          kind?: string
          max_redemptions?: number | null
          name: string
          organization_id?: string | null
          percentage: number
          redemption_count?: number
          requires_verification?: boolean
          stackable?: boolean
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          advertised?: boolean
          applicable_intervals?: string[]
          applicable_plans?: string[]
          created_at?: string
          created_by?: string | null
          eligibility_type?: string | null
          ends_at?: string | null
          id?: string
          kind?: string
          max_redemptions?: number | null
          name?: string
          organization_id?: string | null
          percentage?: number
          redemption_count?: number
          requires_verification?: boolean
          stackable?: boolean
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_rules_eligibility_type_fkey"
            columns: ["eligibility_type"]
            isOneToOne: false
            referencedRelation: "eligibility_categories"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "discount_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_settings: {
        Row: {
          affiliate_commission_basis: string
          allow_stacking: boolean
          created_at: string
          expiry_reminder_days: number[]
          id: number
          notify_expired: boolean
          notify_expiring: boolean
          notify_failed: boolean
          notify_verified: boolean
          updated_at: string
        }
        Insert: {
          affiliate_commission_basis?: string
          allow_stacking?: boolean
          created_at?: string
          expiry_reminder_days?: number[]
          id?: number
          notify_expired?: boolean
          notify_expiring?: boolean
          notify_failed?: boolean
          notify_verified?: boolean
          updated_at?: string
        }
        Update: {
          affiliate_commission_basis?: string
          allow_stacking?: boolean
          created_at?: string
          expiry_reminder_days?: number[]
          id?: number
          notify_expired?: boolean
          notify_expiring?: boolean
          notify_failed?: boolean
          notify_verified?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      discovered_jobs: {
        Row: {
          company: string | null
          currency: string | null
          dedupe_key: string
          description: string | null
          external_id: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          location: string | null
          posted_at: string | null
          raw: Json
          remote: boolean | null
          salary_max: number | null
          salary_min: number | null
          source: string
          title: string
          url: string
        }
        Insert: {
          company?: string | null
          currency?: string | null
          dedupe_key: string
          description?: string | null
          external_id?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          location?: string | null
          posted_at?: string | null
          raw?: Json
          remote?: boolean | null
          salary_max?: number | null
          salary_min?: number | null
          source: string
          title: string
          url: string
        }
        Update: {
          company?: string | null
          currency?: string | null
          dedupe_key?: string
          description?: string | null
          external_id?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          location?: string | null
          posted_at?: string | null
          raw?: Json
          remote?: boolean | null
          salary_max?: number | null
          salary_min?: number | null
          source?: string
          title?: string
          url?: string
        }
        Relationships: []
      }
      eligibility_categories: {
        Row: {
          active: boolean
          created_at: string
          default_discount_percent: number
          description: string | null
          key: string
          label: string
          requires_verification: boolean
          self_serve: boolean
          sort_order: number
          updated_at: string
          verification_validity_days: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_discount_percent?: number
          description?: string | null
          key: string
          label: string
          requires_verification?: boolean
          self_serve?: boolean
          sort_order?: number
          updated_at?: string
          verification_validity_days?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          default_discount_percent?: number
          description?: string | null
          key?: string
          label?: string
          requires_verification?: boolean
          self_serve?: boolean
          sort_order?: number
          updated_at?: string
          verification_validity_days?: number
        }
        Relationships: []
      }
      eligibility_verifications: {
        Row: {
          created_at: string
          eligibility_type: string
          expires_at: string | null
          failure_reason: string | null
          id: string
          last_checked_at: string | null
          metadata: Json
          provider: string
          provider_reference_id: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          eligibility_type: string
          expires_at?: string | null
          failure_reason?: string | null
          id?: string
          last_checked_at?: string | null
          metadata?: Json
          provider?: string
          provider_reference_id?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          eligibility_type?: string
          expires_at?: string | null
          failure_reason?: string | null
          id?: string
          last_checked_at?: string | null
          metadata?: Json
          provider?: string
          provider_reference_id?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eligibility_verifications_eligibility_type_fkey"
            columns: ["eligibility_type"]
            isOneToOne: false
            referencedRelation: "eligibility_categories"
            referencedColumns: ["key"]
          },
        ]
      }
      email_notification_log: {
        Row: {
          created_at: string
          error: string | null
          id: string
          idempotency_key: string
          metadata: Json
          provider_message_id: string | null
          recipient: string
          status: string
          subject: string
          template: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key: string
          metadata?: Json
          provider_message_id?: string | null
          recipient: string
          status?: string
          subject: string
          template: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string
          metadata?: Json
          provider_message_id?: string | null
          recipient?: string
          status?: string
          subject?: string
          template?: string
          user_id?: string
        }
        Relationships: []
      }
      feature_usage: {
        Row: {
          created_at: string
          credits_used: number
          environment: string
          feature: string
          id: string
          period_start: string
          updated_at: string
          used: number
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_used?: number
          environment?: string
          feature: string
          id?: string
          period_start: string
          updated_at?: string
          used?: number
          user_id: string
        }
        Update: {
          created_at?: string
          credits_used?: number
          environment?: string
          feature?: string
          id?: string
          period_start?: string
          updated_at?: string
          used?: number
          user_id?: string
        }
        Relationships: []
      }
      interview_session_metrics: {
        Row: {
          avg_latency_ms: number | null
          barge_in_count: number
          created_at: string
          details: Json
          dropout_count: number
          duration_sec: number
          end_reason: string | null
          ended_at: string | null
          first_token_latency_ms: number | null
          id: string
          input_tokens: number
          interruption_count: number
          minutes_used: number
          output_tokens: number
          p95_latency_ms: number | null
          provider: string
          reconnect_count: number
          session_id: string | null
          started_at: string
          target_role: string | null
          turn_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_latency_ms?: number | null
          barge_in_count?: number
          created_at?: string
          details?: Json
          dropout_count?: number
          duration_sec?: number
          end_reason?: string | null
          ended_at?: string | null
          first_token_latency_ms?: number | null
          id?: string
          input_tokens?: number
          interruption_count?: number
          minutes_used?: number
          output_tokens?: number
          p95_latency_ms?: number | null
          provider?: string
          reconnect_count?: number
          session_id?: string | null
          started_at?: string
          target_role?: string | null
          turn_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_latency_ms?: number | null
          barge_in_count?: number
          created_at?: string
          details?: Json
          dropout_count?: number
          duration_sec?: number
          end_reason?: string | null
          ended_at?: string | null
          first_token_latency_ms?: number | null
          id?: string
          input_tokens?: number
          interruption_count?: number
          minutes_used?: number
          output_tokens?: number
          p95_latency_ms?: number | null
          provider?: string
          reconnect_count?: number
          session_id?: string | null
          started_at?: string
          target_role?: string | null
          turn_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      interview_session_state: {
        Row: {
          context: Json
          created_at: string
          difficulty: string | null
          elapsed_sec: number
          id: string
          interviewer_state: string
          last_heartbeat_at: string
          persona: string | null
          session_key: string
          status: string
          target_role: string | null
          transcript: Json
          turn_index: number
          updated_at: string
          user_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          difficulty?: string | null
          elapsed_sec?: number
          id?: string
          interviewer_state?: string
          last_heartbeat_at?: string
          persona?: string | null
          session_key: string
          status?: string
          target_role?: string | null
          transcript?: Json
          turn_index?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          difficulty?: string | null
          elapsed_sec?: number
          id?: string
          interviewer_state?: string
          last_heartbeat_at?: string
          persona?: string | null
          session_key?: string
          status?: string
          target_role?: string | null
          transcript?: Json
          turn_index?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      interview_sessions: {
        Row: {
          created_at: string
          duration_sec: number
          focus_areas: string[] | null
          id: string
          integrity: Json | null
          overall_score: number | null
          pdf_path: string | null
          practice_plan: Json | null
          report: Json
          target_role: string | null
          transcript: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_sec?: number
          focus_areas?: string[] | null
          id?: string
          integrity?: Json | null
          overall_score?: number | null
          pdf_path?: string | null
          practice_plan?: Json | null
          report: Json
          target_role?: string | null
          transcript?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_sec?: number
          focus_areas?: string[] | null
          id?: string
          integrity?: Json | null
          overall_score?: number | null
          pdf_path?: string | null
          practice_plan?: Json | null
          report?: Json
          target_role?: string | null
          transcript?: Json | null
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
      legal_acceptances: {
        Row: {
          accepted_at: string
          created_at: string
          doc_type: string
          document_id: string
          id: string
          ip_hash: string | null
          user_agent: string | null
          user_id: string
          version: number
        }
        Insert: {
          accepted_at?: string
          created_at?: string
          doc_type: string
          document_id: string
          id?: string
          ip_hash?: string | null
          user_agent?: string | null
          user_id: string
          version: number
        }
        Update: {
          accepted_at?: string
          created_at?: string
          doc_type?: string
          document_id?: string
          id?: string
          ip_hash?: string | null
          user_agent?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "legal_acceptances_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          content: string | null
          content_key: string | null
          created_at: string
          created_by: string | null
          doc_type: string
          effective_date: string
          id: string
          published_at: string | null
          requires_acceptance: boolean
          status: string
          summary_of_changes: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          content?: string | null
          content_key?: string | null
          created_at?: string
          created_by?: string | null
          doc_type: string
          effective_date?: string
          id?: string
          published_at?: string | null
          requires_acceptance?: boolean
          status?: string
          summary_of_changes?: string | null
          title: string
          updated_at?: string
          version: number
        }
        Update: {
          content?: string | null
          content_key?: string | null
          created_at?: string
          created_by?: string | null
          doc_type?: string
          effective_date?: string
          id?: string
          published_at?: string | null
          requires_acceptance?: boolean
          status?: string
          summary_of_changes?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
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
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          active: boolean
          contact_email: string | null
          created_at: string
          created_by: string | null
          discount_percent: number
          email_domains: string[]
          id: string
          name: string
          notes: string | null
          org_type: string
          seats: number | null
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          discount_percent?: number
          email_domains?: string[]
          id?: string
          name: string
          notes?: string | null
          org_type?: string
          seats?: number | null
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          discount_percent?: number
          email_domains?: string[]
          id?: string
          name?: string
          notes?: string | null
          org_type?: string
          seats?: number | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      paddle_customers: {
        Row: {
          created_at: string
          customer_id: string
          email: string
          environment: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          email: string
          environment?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          email?: string
          environment?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      paddle_discounts: {
        Row: {
          created_at: string
          environment: string
          id: string
          paddle_discount_id: string
          percentage: number
          recurring: boolean
        }
        Insert: {
          created_at?: string
          environment: string
          id?: string
          paddle_discount_id: string
          percentage: number
          recurring?: boolean
        }
        Update: {
          created_at?: string
          environment?: string
          id?: string
          paddle_discount_id?: string
          percentage?: number
          recurring?: boolean
        }
        Relationships: []
      }
      paddle_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          customer_id: string
          environment: string
          price_id: string
          product_id: string
          scheduled_change_action: string | null
          scheduled_change_at: string | null
          status: string
          subscription_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          customer_id: string
          environment?: string
          price_id: string
          product_id: string
          scheduled_change_action?: string | null
          scheduled_change_at?: string | null
          status: string
          subscription_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          customer_id?: string
          environment?: string
          price_id?: string
          product_id?: string
          scheduled_change_action?: string | null
          scheduled_change_at?: string | null
          status?: string
          subscription_id?: string
          updated_at?: string
          user_id?: string | null
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
          environment: string
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
          environment?: string
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
          environment?: string
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
      scheduled_interviews: {
        Row: {
          calendar_id: string | null
          company: string | null
          created_at: string
          ends_at: string | null
          external_event_id: string | null
          followup_sent_at: string | null
          html_link: string | null
          id: string
          kind: string
          location: string | null
          notes: string | null
          reminder_sent_at: string | null
          source: string
          starts_at: string
          status: string
          target_role: string | null
          timezone: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_id?: string | null
          company?: string | null
          created_at?: string
          ends_at?: string | null
          external_event_id?: string | null
          followup_sent_at?: string | null
          html_link?: string | null
          id?: string
          kind?: string
          location?: string | null
          notes?: string | null
          reminder_sent_at?: string | null
          source?: string
          starts_at: string
          status?: string
          target_role?: string | null
          timezone?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          calendar_id?: string | null
          company?: string | null
          created_at?: string
          ends_at?: string | null
          external_event_id?: string | null
          followup_sent_at?: string | null
          html_link?: string | null
          id?: string
          kind?: string
          location?: string | null
          notes?: string | null
          reminder_sent_at?: string | null
          source?: string
          starts_at?: string
          status?: string
          target_role?: string | null
          timezone?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          category: string
          created_at: string
          decision: string
          details: Json
          environment: string | null
          event: string
          feature: string | null
          id: string
          reason: string | null
          source: string | null
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          decision: string
          details?: Json
          environment?: string | null
          event: string
          feature?: string | null
          id?: string
          reason?: string | null
          source?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          decision?: string
          details?: Json
          environment?: string | null
          event?: string
          feature?: string | null
          id?: string
          reason?: string | null
          source?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      seo_snapshots: {
        Row: {
          alerts: Json
          avg_position: number | null
          captured_at: string
          changes: Json
          clicks: number
          ctr: number
          id: string
          impressions: number
          inspections: Json
          lighthouse: Json
          property: string | null
          sitemaps: Json
          top_pages: Json
          top_queries: Json
        }
        Insert: {
          alerts?: Json
          avg_position?: number | null
          captured_at?: string
          changes?: Json
          clicks?: number
          ctr?: number
          id?: string
          impressions?: number
          inspections?: Json
          lighthouse?: Json
          property?: string | null
          sitemaps?: Json
          top_pages?: Json
          top_queries?: Json
        }
        Update: {
          alerts?: Json
          avg_position?: number | null
          captured_at?: string
          changes?: Json
          clicks?: number
          ctr?: number
          id?: string
          impressions?: number
          inspections?: Json
          lighthouse?: Json
          property?: string | null
          sitemaps?: Json
          top_pages?: Json
          top_queries?: Json
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
          environment: string
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
          environment?: string
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
          environment?: string
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
          details: Json | null
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
          details?: Json | null
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
          details?: Json | null
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
          environment: string
          id: string
          interview_credits: number
          updated_at: string
          user_id: string
        }
        Insert: {
          application_credits?: number
          created_at?: string
          environment?: string
          id?: string
          interview_credits?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          application_credits?: number
          created_at?: string
          environment?: string
          id?: string
          interview_credits?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_integrations: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          last_error: string | null
          last_synced_at: string | null
          metadata: Json
          provider: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          metadata?: Json
          provider: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          metadata?: Json
          provider?: string
          status?: string
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
      verification_institutions: {
        Row: {
          category: string | null
          country: string | null
          created_at: string
          email_domain: string
          id: string
          name: string
          notes: string | null
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          category?: string | null
          country?: string | null
          created_at?: string
          email_domain: string
          id?: string
          name: string
          notes?: string | null
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          category?: string | null
          country?: string | null
          created_at?: string
          email_domain?: string
          id?: string
          name?: string
          notes?: string | null
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_institutions_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "eligibility_categories"
            referencedColumns: ["key"]
          },
        ]
      }
      verification_requests: {
        Row: {
          category: string
          country: string | null
          created_at: string
          discount_percentage: number
          document_path: string | null
          domain_matched: boolean
          email: string
          full_name: string
          id: string
          organization: string | null
          personal_email: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          role_or_status: string | null
          status: string
          submitted_at: string
          supporting_information: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          category: string
          country?: string | null
          created_at?: string
          discount_percentage?: number
          document_path?: string | null
          domain_matched?: boolean
          email: string
          full_name: string
          id?: string
          organization?: string | null
          personal_email?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          role_or_status?: string | null
          status?: string
          submitted_at?: string
          supporting_information?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          category?: string
          country?: string | null
          created_at?: string
          discount_percentage?: number
          document_path?: string | null
          domain_matched?: boolean
          email?: string
          full_name?: string
          id?: string
          organization?: string | null
          personal_email?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          role_or_status?: string | null
          status?: string
          submitted_at?: string
          supporting_information?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "eligibility_categories"
            referencedColumns: ["key"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_legal_document: {
        Args: { _document_id: string; _user_agent?: string }
        Returns: string
      }
      admin_affiliate_overview: {
        Args: never
        Returns: {
          affiliate_code: string
          approved_amount: number
          clicks: number
          conversions: number
          created_at: string
          display_name: string
          paid_amount: number
          pending_amount: number
          profile_id: string
          referrals: number
          reversed_amount: number
          status: Database["public"]["Enums"]["affiliate_profile_status"]
          suspicious: boolean
          user_id: string
        }[]
      }
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
      admin_legal_document_stats: {
        Args: never
        Returns: {
          accepted_count: number
          doc_type: string
          document_id: string
          status: string
          total_users: number
          version: number
        }[]
      }
      admin_legal_pending_users: {
        Args: { _document_id: string; _limit?: number }
        Returns: {
          display_name: string
          joined_at: string
          user_id: string
        }[]
      }
      admin_mark_payout_paid: {
        Args: {
          _payout_id: string
          _payout_method?: string
          _reference?: string
        }
        Returns: undefined
      }
      admin_publish_legal_document: {
        Args: { _document_id: string }
        Returns: string
      }
      admin_review_verification: {
        Args: { _reason?: string; _status: string; _verification_id: string }
        Returns: undefined
      }
      admin_review_verification_request: {
        Args: {
          _decision: string
          _discount_percentage?: number
          _notes?: string
          _request_id: string
        }
        Returns: undefined
      }
      admin_set_commission_status: {
        Args: {
          _commission_ids: string[]
          _reason?: string
          _status: Database["public"]["Enums"]["affiliate_commission_status"]
        }
        Returns: number
      }
      admin_verification_requests: {
        Args: { _limit?: number; _status?: string }
        Returns: {
          applicant_name: string
          category: string
          category_label: string
          country: string
          discount_percentage: number
          document_path: string
          domain_matched: boolean
          email: string
          full_name: string
          id: string
          organization: string
          personal_email: string
          reviewed_at: string
          reviewer_name: string
          reviewer_notes: string
          role_or_status: string
          status: string
          submitted_at: string
          supporting_information: string
          user_id: string
          website: string
        }[]
      }
      affiliate_click_is_valid: {
        Args: { _code: string; _profile_id: string }
        Returns: boolean
      }
      affiliate_leaderboard: {
        Args: { _limit?: number }
        Returns: {
          alias: string
          confirmed_referrals: number
          is_me: boolean
          rank: number
          tier_color: string
          tier_name: string
        }[]
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
      best_discount_for: {
        Args: { _interval?: string; _plan?: string; _user_id: string }
        Returns: Json
      }
      consume_entitlement: {
        Args: {
          _amount?: number
          _env?: string
          _feature: string
          _user_id: string
        }
        Returns: Json
      }
      current_plan_tier: {
        Args: { _env?: string; _user_id: string }
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
      entitlement_snapshot: { Args: { _env?: string }; Returns: Json }
      expire_stale_verifications: { Args: never; Returns: number }
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
      has_active_subscription: {
        Args: { _env?: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_anonymous_session: { Args: never; Returns: boolean }
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
      log_admin_access_denied: {
        Args: { _reason?: string; _route: string }
        Returns: undefined
      }
      log_user_preferences_read: {
        Args: { _found?: boolean; _source?: string }
        Returns: undefined
      }
      lookup_affiliate_by_code: {
        Args: { _code: string }
        Returns: {
          code: string
          is_active: boolean
          profile_id: string
        }[]
      }
      my_affiliate_overview: { Args: never; Returns: Json }
      my_eligibility_state: { Args: never; Returns: Json }
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
      pending_legal_acceptances: {
        Args: never
        Returns: {
          doc_type: string
          document_id: string
          effective_date: string
          summary_of_changes: string
          title: string
          version: number
        }[]
      }
      plan_allowance: {
        Args: { _feature: string; _tier: string }
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
      record_discount_redemption: {
        Args: {
          _currency: string
          _discount: number
          _eligibility_type: string
          _env: string
          _gross: number
          _interval: string
          _net: number
          _percentage: number
          _plan: string
          _rule_id: string
          _subscription_id: string
          _transaction_id: string
          _user_id: string
        }
        Returns: string
      }
      record_security_event: {
        Args: {
          _category: string
          _decision: string
          _details?: Json
          _env?: string
          _event: string
          _feature?: string
          _reason?: string
          _source?: string
          _user_id?: string
        }
        Returns: string
      }
      refund_entitlement: {
        Args: {
          _amount?: number
          _env?: string
          _feature: string
          _user_id: string
        }
        Returns: undefined
      }
      reject_affiliate_application: {
        Args: { _application_id: string; _reason?: string }
        Returns: undefined
      }
      request_institution: {
        Args: {
          _category?: string
          _country?: string
          _email_domain: string
          _name: string
          _notes?: string
          _website?: string
        }
        Returns: string
      }
      reverse_commission_for_source: {
        Args: { _reason?: string; _source_record_id: string }
        Returns: number
      }
      submit_verification_request: {
        Args: {
          _category: string
          _country?: string
          _document_path?: string
          _email: string
          _full_name: string
          _organization?: string
          _personal_email?: string
          _role_or_status?: string
          _supporting_information?: string
          _website?: string
        }
        Returns: string
      }
      subscription_grants_access: {
        Args: { _current_period_end: string; _status: string }
        Returns: boolean
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
