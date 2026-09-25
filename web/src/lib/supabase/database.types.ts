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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      academies: {
        Row: {
          created_at: string
          created_by: string
          icon: string
          id: string
          name: string
          slug: string
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          icon: string
          id?: string
          name: string
          slug: string
          subject: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          icon?: string
          id?: string
          name?: string
          slug?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_levels: {
        Row: {
          academy_id: string
          level_id: string
          sort_order: number
        }
        Insert: {
          academy_id: string
          level_id: string
          sort_order: number
        }
        Update: {
          academy_id?: string
          level_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "academy_levels_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_levels_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "global_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_memberships: {
        Row: {
          academy_id: string
          created_at: string
          created_by: string
          role: Database["public"]["Enums"]["academy_role"]
          user_id: string
        }
        Insert: {
          academy_id: string
          created_at?: string
          created_by: string
          role: Database["public"]["Enums"]["academy_role"]
          user_id: string
        }
        Update: {
          academy_id?: string
          created_at?: string
          created_by?: string
          role?: Database["public"]["Enums"]["academy_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_memberships_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_memberships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_tracks: {
        Row: {
          academy_id: string
          created_at: string
          id: string
          level_id: string
          name: string
          sort_order: number
        }
        Insert: {
          academy_id: string
          created_at?: string
          id?: string
          level_id: string
          name: string
          sort_order?: number
        }
        Update: {
          academy_id?: string
          created_at?: string
          id?: string
          level_id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "academy_tracks_academy_id_level_id_fkey"
            columns: ["academy_id", "level_id"]
            isOneToOne: false
            referencedRelation: "academy_levels"
            referencedColumns: ["academy_id", "level_id"]
          },
        ]
      }
      global_levels: {
        Row: {
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          id: string
          name: string
          sort_order: number
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      student_phone_challenges: {
        Row: {
          attempts: number
          challenge_id: string
          code_hash: string
          consumed_at: string | null
          expires_at: string
          phone: string
          sends_in_window: number
          sent_at: string
          user_id: string
          window_started_at: string
        }
        Insert: {
          attempts?: number
          challenge_id: string
          code_hash: string
          consumed_at?: string | null
          expires_at: string
          phone: string
          sends_in_window?: number
          sent_at: string
          user_id: string
          window_started_at: string
        }
        Update: {
          attempts?: number
          challenge_id?: string
          code_hash?: string
          consumed_at?: string | null
          expires_at?: string
          phone?: string
          sends_in_window?: number
          sent_at?: string
          user_id?: string
          window_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_phone_challenges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_profiles: {
        Row: {
          created_at: string
          level_id: string | null
          parent_phone: string | null
          parent_phone_verified_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          level_id?: string | null
          parent_phone?: string | null
          parent_phone_verified_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          level_id?: string | null
          parent_phone?: string | null
          parent_phone_verified_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_profiles_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "global_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      academy_role_for: {
        Args: { target_academy_id: string }
        Returns: Database["public"]["Enums"]["academy_role"]
      }
      academy_slug_is_available: {
        Args: { candidate_slug: string }
        Returns: boolean
      }
      create_academy: { Args: { academy_name: string }; Returns: string }
      create_academy_setup: {
        Args: {
          academy_icon: string
          academy_name: string
          academy_slug: string
          academy_subject: string
          academy_tracks: Json
          selected_level_ids: string[]
        }
        Returns: string
      }
      finish_student_profile: {
        Args: { p_level_id: string; p_user_id: string }
        Returns: boolean
      }
      is_academy_member: {
        Args: { target_academy_id: string }
        Returns: boolean
      }
      shares_academy_with: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      start_student_parent_challenge: {
        Args: {
          p_challenge_id: string
          p_code_hash: string
          p_phone: string
          p_user_id: string
        }
        Returns: string
      }
      verify_student_parent_challenge: {
        Args: { p_challenge_id: string; p_code_hash: string; p_user_id: string }
        Returns: string
      }
    }
    Enums: {
      academy_role: "owner" | "admin" | "instructor"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      academy_role: ["owner", "admin", "instructor"],
    },
  },
} as const
