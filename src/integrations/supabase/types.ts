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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
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
      app_role: ["admin", "user"],
    },
  },
} as const
