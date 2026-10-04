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
      academic_years: {
        Row: {
          academy_id: string
          closed_at: string | null
          created_at: string
          ends_on: string | null
          id: string
          start_year: number
          starts_on: string | null
        }
        Insert: {
          academy_id: string
          closed_at?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          start_year: number
          starts_on?: string | null
        }
        Update: {
          academy_id?: string
          closed_at?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          start_year?: number
          starts_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
        ]
      }
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
      academy_student_profiles: {
        Row: {
          academy_id: string
          created_at: string
          created_by: string
          id: string
        }
        Insert: {
          academy_id: string
          created_at?: string
          created_by: string
          id?: string
        }
        Update: {
          academy_id?: string
          created_at?: string
          created_by?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_student_profiles_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_student_profiles_created_by_fkey"
            columns: ["created_by"]
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
      annual_student_records: {
        Row: {
          academic_year_id: string
          academy_id: string
          academy_student_profile_id: string
          archived_at: string | null
          created_at: string
          created_by: string
          full_name: string
          id: string
          level_id: string
          parent_phone: string
          participation_type: Database["public"]["Enums"]["student_participation_type"]
          primary_group_id: string | null
          student_phone: string
          track_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          academy_student_profile_id: string
          archived_at?: string | null
          created_at?: string
          created_by: string
          full_name: string
          id?: string
          level_id: string
          parent_phone: string
          participation_type: Database["public"]["Enums"]["student_participation_type"]
          primary_group_id?: string | null
          student_phone: string
          track_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          academy_student_profile_id?: string
          archived_at?: string | null
          created_at?: string
          created_by?: string
          full_name?: string
          id?: string
          level_id?: string
          parent_phone?: string
          participation_type?: Database["public"]["Enums"]["student_participation_type"]
          primary_group_id?: string | null
          student_phone?: string
          track_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "annual_student_records_academy_id_academic_year_id_fkey"
            columns: ["academy_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "annual_student_records_academy_id_academic_year_id_primary_fkey"
            columns: ["academy_id", "academic_year_id", "primary_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "annual_student_records_academy_id_academy_student_profile__fkey"
            columns: ["academy_id", "academy_student_profile_id"]
            isOneToOne: false
            referencedRelation: "academy_student_profiles"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "annual_student_records_academy_id_level_id_fkey"
            columns: ["academy_id", "level_id"]
            isOneToOne: false
            referencedRelation: "academy_levels"
            referencedColumns: ["academy_id", "level_id"]
          },
          {
            foreignKeyName: "annual_student_records_academy_id_level_id_track_id_fkey"
            columns: ["academy_id", "level_id", "track_id"]
            isOneToOne: false
            referencedRelation: "academy_tracks"
            referencedColumns: ["academy_id", "level_id", "id"]
          },
          {
            foreignKeyName: "annual_student_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
      groups: {
        Row: {
          academic_year_id: string
          academy_id: string
          archived_at: string | null
          capacity: number | null
          created_at: string
          id: string
          level_id: string
          name: string
          notes: string | null
          track_id: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          archived_at?: string | null
          capacity?: number | null
          created_at?: string
          id?: string
          level_id: string
          name: string
          notes?: string | null
          track_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          archived_at?: string | null
          capacity?: number | null
          created_at?: string
          id?: string
          level_id?: string
          name?: string
          notes?: string | null
          track_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_academy_id_academic_year_id_fkey"
            columns: ["academy_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "groups_academy_id_level_id_fkey"
            columns: ["academy_id", "level_id"]
            isOneToOne: false
            referencedRelation: "academy_levels"
            referencedColumns: ["academy_id", "level_id"]
          },
          {
            foreignKeyName: "groups_academy_id_level_id_track_id_fkey"
            columns: ["academy_id", "level_id", "track_id"]
            isOneToOne: false
            referencedRelation: "academy_tracks"
            referencedColumns: ["academy_id", "level_id", "id"]
          },
        ]
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
      schedule_sessions: {
        Row: {
          academic_year_id: string
          academy_id: string
          ends_at: string
          id: string
          occurs_on: string
          schedule_id: string
          starts_at: string
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          ends_at: string
          id?: string
          occurs_on: string
          schedule_id: string
          starts_at: string
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          ends_at?: string
          id?: string
          occurs_on?: string
          schedule_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_sessions_academy_id_academic_year_id_schedule_id_fkey"
            columns: ["academy_id", "academic_year_id", "schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
        ]
      }
      schedule_slots: {
        Row: {
          academic_year_id: string
          academy_id: string
          ends_at: string
          id: string
          schedule_id: string
          starts_at: string
          weekday: number
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          ends_at: string
          id?: string
          schedule_id: string
          starts_at: string
          weekday: number
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          ends_at?: string
          id?: string
          schedule_id?: string
          starts_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedule_slots_academy_id_academic_year_id_schedule_id_fkey"
            columns: ["academy_id", "academic_year_id", "schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
        ]
      }
      schedules: {
        Row: {
          academic_year_id: string
          academy_id: string
          archived_at: string | null
          audience: Database["public"]["Enums"]["schedule_audience"]
          created_at: string
          created_by: string
          group_id: string | null
          id: string
          kind: Database["public"]["Enums"]["schedule_kind"]
          level_id: string | null
          location: string | null
          mandatory: boolean
          title: string
          track_id: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          archived_at?: string | null
          audience: Database["public"]["Enums"]["schedule_audience"]
          created_at?: string
          created_by?: string
          group_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["schedule_kind"]
          level_id?: string | null
          location?: string | null
          mandatory?: boolean
          title: string
          track_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          archived_at?: string | null
          audience?: Database["public"]["Enums"]["schedule_audience"]
          created_at?: string
          created_by?: string
          group_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["schedule_kind"]
          level_id?: string | null
          location?: string | null
          mandatory?: boolean
          title?: string
          track_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_academy_id_academic_year_id_fkey"
            columns: ["academy_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "schedules_academy_id_academic_year_id_group_id_fkey"
            columns: ["academy_id", "academic_year_id", "group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "schedules_academy_id_level_id_fkey"
            columns: ["academy_id", "level_id"]
            isOneToOne: false
            referencedRelation: "academy_levels"
            referencedColumns: ["academy_id", "level_id"]
          },
          {
            foreignKeyName: "schedules_academy_id_level_id_track_id_fkey"
            columns: ["academy_id", "level_id", "track_id"]
            isOneToOne: false
            referencedRelation: "academy_tracks"
            referencedColumns: ["academy_id", "level_id", "id"]
          },
          {
            foreignKeyName: "schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_import_counters: {
        Row: {
          academy_id: string
          last_number: number
        }
        Insert: {
          academy_id: string
          last_number: number
        }
        Update: {
          academy_id?: string
          last_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_import_counters_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: true
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
        ]
      }
      student_import_rows: {
        Row: {
          academy_id: string
          batch_index: number | null
          corrected: Json | null
          duplicate_rows: number[] | null
          excluded: boolean
          existing_archived: boolean | null
          existing_record_id: string | null
          input: Json | null
          issues: Json
          ordinal: number
          outcome: string | null
          outcome_code: string | null
          record_id: string | null
          session_id: string
          source: Json
          source_row: number
          status: string
          student_phone: string | null
        }
        Insert: {
          academy_id: string
          batch_index?: number | null
          corrected?: Json | null
          duplicate_rows?: number[] | null
          excluded?: boolean
          existing_archived?: boolean | null
          existing_record_id?: string | null
          input?: Json | null
          issues?: Json
          ordinal: number
          outcome?: string | null
          outcome_code?: string | null
          record_id?: string | null
          session_id: string
          source: Json
          source_row: number
          status?: string
          student_phone?: string | null
        }
        Update: {
          academy_id?: string
          batch_index?: number | null
          corrected?: Json | null
          duplicate_rows?: number[] | null
          excluded?: boolean
          existing_archived?: boolean | null
          existing_record_id?: string | null
          input?: Json | null
          issues?: Json
          ordinal?: number
          outcome?: string | null
          outcome_code?: string | null
          record_id?: string | null
          session_id?: string
          source?: Json
          source_row?: number
          status?: string
          student_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_import_rows_academy_id_session_id_fkey"
            columns: ["academy_id", "session_id"]
            isOneToOne: false
            referencedRelation: "student_import_sessions"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "student_import_rows_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "annual_student_records"
            referencedColumns: ["id"]
          },
        ]
      }
      student_import_sessions: {
        Row: {
          academic_year_id: string
          academy_id: string
          batch_count: number | null
          blocked_reason: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string
          created_count: number
          defaults: Json
          expected_rows: number
          failed_count: number
          file_name: string
          format: Database["public"]["Enums"]["student_import_format"]
          id: string
          import_number: number
          imported_by_name: string
          revision: number
          skipped_count: number
          staged_rows: number
          state: Database["public"]["Enums"]["student_import_state"]
          updated_at: string
          worksheet: string | null
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          batch_count?: number | null
          blocked_reason?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by: string
          created_count?: number
          defaults?: Json
          expected_rows: number
          failed_count?: number
          file_name: string
          format: Database["public"]["Enums"]["student_import_format"]
          id?: string
          import_number: number
          imported_by_name: string
          revision?: number
          skipped_count?: number
          staged_rows?: number
          state?: Database["public"]["Enums"]["student_import_state"]
          updated_at?: string
          worksheet?: string | null
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          batch_count?: number | null
          blocked_reason?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string
          created_count?: number
          defaults?: Json
          expected_rows?: number
          failed_count?: number
          file_name?: string
          format?: Database["public"]["Enums"]["student_import_format"]
          id?: string
          import_number?: number
          imported_by_name?: string
          revision?: number
          skipped_count?: number
          staged_rows?: number
          state?: Database["public"]["Enums"]["student_import_state"]
          updated_at?: string
          worksheet?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_import_sessions_academy_id_academic_year_id_fkey"
            columns: ["academy_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "student_import_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      cancel_student_import: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      check_student_record_input: {
        Args: {
          p_full_name: string
          p_level_id: string
          p_parent_phone: string
          p_participation_type: Database["public"]["Enums"]["student_participation_type"]
          p_student_phone: string
        }
        Returns: Record<string, unknown>
      }
      confirm_student_import: {
        Args: { p_expected_revision: number; p_session_id: string }
        Returns: Json
      }
      correct_student_import_row: {
        Args: {
          p_expected_revision: number
          p_input: Json
          p_ordinal: number
          p_session_id: string
        }
        Returns: number
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
      create_schedule: {
        Args: {
          p_academic_year_id: string
          p_academy_id: string
          p_audience: Database["public"]["Enums"]["schedule_audience"]
          p_group_id: string
          p_kind: Database["public"]["Enums"]["schedule_kind"]
          p_level_id: string
          p_location: string
          p_mandatory: boolean
          p_sessions: Json
          p_slots: Json
          p_title: string
          p_track_id: string
        }
        Returns: string
      }
      create_student_record: {
        Args: {
          p_academic_year_id: string
          p_academy_id: string
          p_full_name: string
          p_level_id: string
          p_parent_phone: string
          p_participation_type: Database["public"]["Enums"]["student_participation_type"]
          p_primary_group_id: string
          p_student_phone: string
          p_track_id: string
        }
        Returns: {
          id: string
          version: number
        }[]
      }
      finalize_student_import: {
        Args: { p_session_id: string }
        Returns: number
      }
      finish_student_profile: {
        Args: { p_level_id: string; p_user_id: string }
        Returns: boolean
      }
      is_academy_member: {
        Args: { target_academy_id: string }
        Returns: boolean
      }
      list_student_import_rows: {
        Args: {
          p_page_index: number
          p_page_size: number
          p_search: string
          p_session_id: string
          p_status: string
        }
        Returns: Json
      }
      list_student_records: {
        Args: {
          p_academic_year_id: string
          p_academy_id: string
          p_group: string
          p_level_id: string
          p_page_index: number
          p_page_size: number
          p_participation_type: string
          p_search: string
          p_sorts: Json
          p_status: string
          p_track: string
        }
        Returns: Json
      }
      lock_student_import_session: {
        Args: { p_session_id: string }
        Returns: {
          academic_year_id: string
          academy_id: string
          batch_count: number | null
          blocked_reason: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string
          created_count: number
          defaults: Json
          expected_rows: number
          failed_count: number
          file_name: string
          format: Database["public"]["Enums"]["student_import_format"]
          id: string
          import_number: number
          imported_by_name: string
          revision: number
          skipped_count: number
          staged_rows: number
          state: Database["public"]["Enums"]["student_import_state"]
          updated_at: string
          worksheet: string | null
        }
        SetofOptions: {
          from: "*"
          to: "student_import_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      normalize_egyptian_phone: { Args: { value: string }; Returns: string }
      normalize_import_label: { Args: { value: string }; Returns: string }
      process_student_import_batch: {
        Args: { p_batch_index: number; p_session_id: string }
        Returns: Json
      }
      refresh_student_import: {
        Args: { p_ordinal: number; p_session_id: string }
        Returns: string
      }
      remove_student_import_entries: {
        Args: {
          p_expected_revision: number
          p_ordinals: number[]
          p_session_id: string
        }
        Returns: number
      }
      require_student_import_state: {
        Args: {
          expected: Database["public"]["Enums"]["student_import_state"]
          s: Database["public"]["Tables"]["student_import_sessions"]["Row"]
        }
        Returns: undefined
      }
      require_student_import_year: {
        Args: {
          s: Database["public"]["Tables"]["student_import_sessions"]["Row"]
        }
        Returns: undefined
      }
      resolve_student_import_row: {
        Args: {
          p_academic_year_id: string
          p_academy_id: string
          p_corrected: Json
          p_defaults: Json
          p_source: Json
        }
        Returns: Record<string, unknown>
      }
      set_student_import_row_excluded: {
        Args: {
          p_excluded: boolean
          p_expected_revision: number
          p_ordinal: number
          p_session_id: string
        }
        Returns: number
      }
      set_student_records_archived: {
        Args: {
          p_academic_year_id: string
          p_academy_id: string
          p_archived: boolean
          p_records: Json
        }
        Returns: string[]
      }
      set_student_records_group: {
        Args: {
          p_academic_year_id: string
          p_academy_id: string
          p_primary_group_id: string
          p_records: Json
        }
        Returns: Json
      }
      shares_academy_with: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      stage_student_import_rows: {
        Args: { p_rows: Json; p_session_id: string }
        Returns: number
      }
      start_student_import: {
        Args: {
          p_academic_year_id: string
          p_academy_id: string
          p_defaults: Json
          p_expected_rows: number
          p_file_name: string
          p_format: Database["public"]["Enums"]["student_import_format"]
          p_replaces: string
          p_worksheet: string
        }
        Returns: string
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
      student_import_cell: {
        Args: { cells: Json; field: string }
        Returns: string
      }
      student_import_fingerprint: {
        Args: { p_session_id: string }
        Returns: string
      }
      student_import_summary: { Args: { p_session_id: string }; Returns: Json }
      update_schedule: {
        Args: {
          p_academy_id: string
          p_audience: Database["public"]["Enums"]["schedule_audience"]
          p_group_id: string
          p_level_id: string
          p_location: string
          p_mandatory: boolean
          p_schedule_id: string
          p_sessions: Json
          p_slots: Json
          p_title: string
          p_track_id: string
        }
        Returns: boolean
      }
      update_student_record: {
        Args: {
          p_academy_id: string
          p_expected_version: number
          p_full_name: string
          p_level_id: string
          p_parent_phone: string
          p_participation_type: Database["public"]["Enums"]["student_participation_type"]
          p_primary_group_id: string
          p_record_id: string
          p_student_phone: string
          p_track_id: string
        }
        Returns: {
          id: string
          version: number
        }[]
      }
      verify_student_parent_challenge: {
        Args: { p_challenge_id: string; p_code_hash: string; p_user_id: string }
        Returns: string
      }
    }
    Enums: {
      academy_role: "owner" | "admin" | "instructor"
      schedule_audience: "group" | "level" | "program"
      schedule_kind: "recurring" | "one_off"
      student_import_format: "csv" | "json" | "xlsx"
      student_import_state:
        | "staging"
        | "reviewing"
        | "importing"
        | "completed"
        | "cancelled"
        | "blocked"
      student_participation_type: "in_person" | "online_only"
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
      schedule_audience: ["group", "level", "program"],
      schedule_kind: ["recurring", "one_off"],
      student_import_format: ["csv", "json", "xlsx"],
      student_import_state: [
        "staging",
        "reviewing",
        "importing",
        "completed",
        "cancelled",
        "blocked",
      ],
      student_participation_type: ["in_person", "online_only"],
    },
  },
} as const
