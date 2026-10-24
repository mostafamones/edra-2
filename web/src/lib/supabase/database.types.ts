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
    PostgrestVersion: "14.17"
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
          phone: string | null
          slug: string
          subject: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          icon: string
          id?: string
          name: string
          phone?: string | null
          slug: string
          subject: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          icon?: string
          id?: string
          name?: string
          phone?: string | null
          slug?: string
          subject?: string
          updated_at?: string
          whatsapp?: string | null
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
          last_stopped_at: string | null
          last_stopped_by: string | null
          learning_epoch: number
          level_id: string
          resumed_at: string | null
          resumed_by: string | null
          sort_order: number
          stopped_at: string | null
          stopped_by: string | null
          version: number
        }
        Insert: {
          academy_id: string
          last_stopped_at?: string | null
          last_stopped_by?: string | null
          learning_epoch?: number
          level_id: string
          resumed_at?: string | null
          resumed_by?: string | null
          sort_order: number
          stopped_at?: string | null
          stopped_by?: string | null
          version?: number
        }
        Update: {
          academy_id?: string
          last_stopped_at?: string | null
          last_stopped_by?: string | null
          learning_epoch?: number
          level_id?: string
          resumed_at?: string | null
          resumed_by?: string | null
          sort_order?: number
          stopped_at?: string | null
          stopped_by?: string | null
          version?: number
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
            foreignKeyName: "academy_levels_last_stopped_by_fkey"
            columns: ["last_stopped_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_levels_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "global_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_levels_resumed_by_fkey"
            columns: ["resumed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_levels_stopped_by_fkey"
            columns: ["stopped_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          suspended_at: string | null
          suspended_by: string | null
          user_id: string
        }
        Insert: {
          academy_id: string
          created_at?: string
          created_by: string
          role: Database["public"]["Enums"]["academy_role"]
          suspended_at?: string | null
          suspended_by?: string | null
          user_id: string
        }
        Update: {
          academy_id?: string
          created_at?: string
          created_by?: string
          role?: Database["public"]["Enums"]["academy_role"]
          suspended_at?: string | null
          suspended_by?: string | null
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
            foreignKeyName: "academy_memberships_suspended_by_fkey"
            columns: ["suspended_by"]
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
          access_suspended_at: string | null
          created_at: string
          created_by: string
          id: string
          linked_at: string | null
          user_id: string | null
        }
        Insert: {
          academy_id: string
          access_suspended_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          linked_at?: string | null
          user_id?: string | null
        }
        Update: {
          academy_id?: string
          access_suspended_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          linked_at?: string | null
          user_id?: string | null
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
          {
            foreignKeyName: "academy_student_profiles_user_fk"
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
          retired_at: string | null
          retired_by: string | null
          sort_order: number
          version: number
        }
        Insert: {
          academy_id: string
          created_at?: string
          id?: string
          level_id: string
          name: string
          retired_at?: string | null
          retired_by?: string | null
          sort_order?: number
          version?: number
        }
        Update: {
          academy_id?: string
          created_at?: string
          id?: string
          level_id?: string
          name?: string
          retired_at?: string | null
          retired_by?: string | null
          sort_order?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "academy_tracks_academy_id_level_id_fkey"
            columns: ["academy_id", "level_id"]
            isOneToOne: false
            referencedRelation: "academy_levels"
            referencedColumns: ["academy_id", "level_id"]
          },
          {
            foreignKeyName: "academy_tracks_retired_by_fkey"
            columns: ["retired_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      account_contact_changes: {
        Row: {
          attempts: number
          code_hash: string | null
          commit_attempts: number
          expires_at: string | null
          new_phone: string
          new_sends: number
          new_sent_at: string | null
          new_window_started_at: string | null
          old_phone: string
          old_sends: number
          old_sent_at: string | null
          old_window_started_at: string | null
          operation_id: string
          purpose: string
          session_id: string
          stage: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash?: string | null
          commit_attempts?: number
          expires_at?: string | null
          new_phone: string
          new_sends?: number
          new_sent_at?: string | null
          new_window_started_at?: string | null
          old_phone: string
          old_sends?: number
          old_sent_at?: string | null
          old_window_started_at?: string | null
          operation_id: string
          purpose: string
          session_id: string
          stage: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string | null
          commit_attempts?: number
          expires_at?: string | null
          new_phone?: string
          new_sends?: number
          new_sent_at?: string | null
          new_window_started_at?: string | null
          old_phone?: string
          old_sends?: number
          old_sent_at?: string | null
          old_window_started_at?: string | null
          operation_id?: string
          purpose?: string
          session_id?: string
          stage?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_contact_changes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      account_password_challenges: {
        Row: {
          attempts: number
          challenge_id: string
          claimed_until: string | null
          code_hash: string
          completion_attempts: number
          consumed_at: string | null
          expires_at: string
          grant_expires_at: string | null
          phone: string
          sends_in_window: number
          sent_at: string
          session_id: string
          user_id: string
          verified_at: string | null
          window_started_at: string
        }
        Insert: {
          attempts?: number
          challenge_id: string
          claimed_until?: string | null
          code_hash: string
          completion_attempts?: number
          consumed_at?: string | null
          expires_at: string
          grant_expires_at?: string | null
          phone: string
          sends_in_window?: number
          sent_at: string
          session_id: string
          user_id: string
          verified_at?: string | null
          window_started_at: string
        }
        Update: {
          attempts?: number
          challenge_id?: string
          claimed_until?: string | null
          code_hash?: string
          completion_attempts?: number
          consumed_at?: string | null
          expires_at?: string
          grant_expires_at?: string | null
          phone?: string
          sends_in_window?: number
          sent_at?: string
          session_id?: string
          user_id?: string
          verified_at?: string | null
          window_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_password_challenges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
      api_rate_windows: {
        Row: {
          actor_id: string
          bucket: string
          hits: number
          window_start: string
        }
        Insert: {
          actor_id: string
          bucket: string
          hits: number
          window_start: string
        }
        Update: {
          actor_id?: string
          bucket?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      assignment_answer_access_events: {
        Row: {
          action: string
          actor_id: string
          assignment_id: string
          created_at: string
          id: string
          reason: string
          record_id: string
        }
        Insert: {
          action: string
          actor_id: string
          assignment_id: string
          created_at?: string
          id: string
          reason: string
          record_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          assignment_id?: string
          created_at?: string
          id?: string
          reason?: string
          record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_answer_access_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_answer_access_events_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_answer_access_events_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "annual_student_records"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_audience_groups: {
        Row: {
          academic_year_id: string
          academy_id: string
          assignment_id: string
          group_id: string
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          assignment_id: string
          group_id: string
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          assignment_id?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_audience_groups_academy_id_academic_year_id_ass_fkey"
            columns: ["academy_id", "academic_year_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "assignment_audience_groups_academy_id_academic_year_id_gro_fkey"
            columns: ["academy_id", "academic_year_id", "group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
        ]
      }
      assignment_cohort_members: {
        Row: {
          annual_student_record_id: string
          assignment_id: string
          cohort_revision: number
          requirement_ended_at: string | null
        }
        Insert: {
          annual_student_record_id: string
          assignment_id: string
          cohort_revision: number
          requirement_ended_at?: string | null
        }
        Update: {
          annual_student_record_id?: string
          assignment_id?: string
          cohort_revision?: number
          requirement_ended_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_cohort_members_annual_student_record_id_fkey"
            columns: ["annual_student_record_id"]
            isOneToOne: false
            referencedRelation: "annual_student_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_cohort_members_assignment_id_cohort_revision_fkey"
            columns: ["assignment_id", "cohort_revision"]
            isOneToOne: false
            referencedRelation: "assignment_cohorts"
            referencedColumns: ["assignment_id", "revision"]
          },
        ]
      }
      assignment_cohorts: {
        Row: {
          assignment_id: string
          audience_basis: Json
          captured_at: string
          captured_by: string | null
          revision: number
          source: string
        }
        Insert: {
          assignment_id: string
          audience_basis: Json
          captured_at?: string
          captured_by?: string | null
          revision: number
          source: string
        }
        Update: {
          assignment_id?: string
          audience_basis?: Json
          captured_at?: string
          captured_by?: string | null
          revision?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_cohorts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_cohorts_captured_by_fkey"
            columns: ["captured_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_corrections: {
        Row: {
          academy_id: string
          assignment_id: string
          choice_id: string | null
          created_at: string
          created_by: string
          max_score: number
          operation: string
          part_id: string
          previous_choice_id: string | null
          previous_max_score: number
          question_id: string
          revision: number
        }
        Insert: {
          academy_id: string
          assignment_id: string
          choice_id?: string | null
          created_at?: string
          created_by: string
          max_score: number
          operation: string
          part_id: string
          previous_choice_id?: string | null
          previous_max_score: number
          question_id: string
          revision: number
        }
        Update: {
          academy_id?: string
          assignment_id?: string
          choice_id?: string | null
          created_at?: string
          created_by?: string
          max_score?: number
          operation?: string
          part_id?: string
          previous_choice_id?: string | null
          previous_max_score?: number
          question_id?: string
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "assignment_corrections_academy_id_assignment_id_fkey"
            columns: ["academy_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "assignment_corrections_assignment_id_part_id_fkey"
            columns: ["assignment_id", "part_id"]
            isOneToOne: false
            referencedRelation: "assignment_parts"
            referencedColumns: ["assignment_id", "id"]
          },
          {
            foreignKeyName: "assignment_corrections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_corrections_part_id_question_id_fkey"
            columns: ["part_id", "question_id"]
            isOneToOne: false
            referencedRelation: "assignment_part_questions"
            referencedColumns: ["part_id", "id"]
          },
          {
            foreignKeyName: "assignment_corrections_question_id_choice_id_fkey"
            columns: ["question_id", "choice_id"]
            isOneToOne: false
            referencedRelation: "assignment_question_choices"
            referencedColumns: ["question_id", "id"]
          },
          {
            foreignKeyName: "assignment_corrections_question_id_previous_choice_id_fkey"
            columns: ["question_id", "previous_choice_id"]
            isOneToOne: false
            referencedRelation: "assignment_question_choices"
            referencedColumns: ["question_id", "id"]
          },
        ]
      }
      assignment_mark_basis_history: {
        Row: {
          annual_student_record_id: string
          answers: Json
          assignment_id: string
          mark: Json
          part_id: string
          revision: number
        }
        Insert: {
          annual_student_record_id: string
          answers: Json
          assignment_id: string
          mark: Json
          part_id: string
          revision: number
        }
        Update: {
          annual_student_record_id?: string
          answers?: Json
          assignment_id?: string
          mark?: Json
          part_id?: string
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "assignment_mark_basis_history_assignment_id_annual_student_fkey"
            columns: ["assignment_id", "annual_student_record_id"]
            isOneToOne: false
            referencedRelation: "assignment_recipients"
            referencedColumns: ["assignment_id", "annual_student_record_id"]
          },
          {
            foreignKeyName: "assignment_mark_basis_history_assignment_id_part_id_fkey"
            columns: ["assignment_id", "part_id"]
            isOneToOne: false
            referencedRelation: "assignment_parts"
            referencedColumns: ["assignment_id", "id"]
          },
          {
            foreignKeyName: "assignment_mark_basis_history_assignment_id_revision_fkey"
            columns: ["assignment_id", "revision"]
            isOneToOne: false
            referencedRelation: "assignment_corrections"
            referencedColumns: ["assignment_id", "revision"]
          },
        ]
      }
      assignment_marks: {
        Row: {
          academy_id: string
          annual_student_record_id: string
          assignment_id: string
          from_answers: boolean
          kind: Database["public"]["Enums"]["assignment_mark_kind"]
          part_id: string
          reason: string | null
          requires_remark: boolean
          score: number
          updated_at: string
          updated_by: string
        }
        Insert: {
          academy_id: string
          annual_student_record_id: string
          assignment_id: string
          from_answers?: boolean
          kind: Database["public"]["Enums"]["assignment_mark_kind"]
          part_id: string
          reason?: string | null
          requires_remark?: boolean
          score: number
          updated_at?: string
          updated_by: string
        }
        Update: {
          academy_id?: string
          annual_student_record_id?: string
          assignment_id?: string
          from_answers?: boolean
          kind?: Database["public"]["Enums"]["assignment_mark_kind"]
          part_id?: string
          reason?: string | null
          requires_remark?: boolean
          score?: number
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_marks_academy_id_assignment_id_fkey"
            columns: ["academy_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "assignment_marks_assignment_id_annual_student_record_id_fkey"
            columns: ["assignment_id", "annual_student_record_id"]
            isOneToOne: false
            referencedRelation: "assignment_recipients"
            referencedColumns: ["assignment_id", "annual_student_record_id"]
          },
          {
            foreignKeyName: "assignment_marks_assignment_id_part_id_fkey"
            columns: ["assignment_id", "part_id"]
            isOneToOne: false
            referencedRelation: "assignment_parts"
            referencedColumns: ["assignment_id", "id"]
          },
          {
            foreignKeyName: "assignment_marks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_online_settings: {
        Row: {
          academy_id: string
          in_person_enabled: boolean
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          academy_id: string
          in_person_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          academy_id?: string
          in_person_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "assignment_online_settings_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: true
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_online_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_online_submissions: {
        Row: {
          actor_id: string
          answers: Json
          assignment_id: string
          draft_version: number
          generation: number
          id: string
          late: boolean
          manifest: Json
          record_id: string
          scoring_revision: number
          submitted_at: string
        }
        Insert: {
          actor_id: string
          answers: Json
          assignment_id: string
          draft_version: number
          generation: number
          id: string
          late: boolean
          manifest: Json
          record_id: string
          scoring_revision: number
          submitted_at: string
        }
        Update: {
          actor_id?: string
          answers?: Json
          assignment_id?: string
          draft_version?: number
          generation?: number
          id?: string
          late?: boolean
          manifest?: Json
          record_id?: string
          scoring_revision?: number
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_online_submissions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_online_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_online_submissions_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "annual_student_records"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_part_questions: {
        Row: {
          academy_id: string
          assignment_id: string
          excluded: boolean
          id: string
          max_score: number
          part_id: string
          position: number
          prompt: string
        }
        Insert: {
          academy_id: string
          assignment_id: string
          excluded?: boolean
          id?: string
          max_score: number
          part_id: string
          position: number
          prompt?: string
        }
        Update: {
          academy_id?: string
          assignment_id?: string
          excluded?: boolean
          id?: string
          max_score?: number
          part_id?: string
          position?: number
          prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_part_questions_academy_id_assignment_id_fkey"
            columns: ["academy_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "assignment_part_questions_assignment_id_part_id_fkey"
            columns: ["assignment_id", "part_id"]
            isOneToOne: false
            referencedRelation: "assignment_parts"
            referencedColumns: ["assignment_id", "id"]
          },
        ]
      }
      assignment_parts: {
        Row: {
          academy_id: string
          assignment_id: string
          created_at: string
          id: string
          instructions: string
          kind: Database["public"]["Enums"]["assignment_part_kind"] | null
          max_score: number
          position: number
          title: string
        }
        Insert: {
          academy_id: string
          assignment_id: string
          created_at?: string
          id?: string
          instructions?: string
          kind?: Database["public"]["Enums"]["assignment_part_kind"] | null
          max_score: number
          position: number
          title: string
        }
        Update: {
          academy_id?: string
          assignment_id?: string
          created_at?: string
          id?: string
          instructions?: string
          kind?: Database["public"]["Enums"]["assignment_part_kind"] | null
          max_score?: number
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_parts_academy_id_assignment_id_fkey"
            columns: ["academy_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["academy_id", "id"]
          },
        ]
      }
      assignment_physical_history: {
        Row: {
          answers: Json
          assignment_id: string
          id: string
          marks: Json
          recipient: Json
          record_id: string
          superseded_at: string
        }
        Insert: {
          answers: Json
          assignment_id: string
          id?: string
          marks: Json
          recipient: Json
          record_id: string
          superseded_at?: string
        }
        Update: {
          answers?: Json
          assignment_id?: string
          id?: string
          marks?: Json
          recipient?: Json
          record_id?: string
          superseded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_physical_history_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_physical_history_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "annual_student_records"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_question_answers: {
        Row: {
          academy_id: string
          annual_student_record_id: string
          assignment_id: string
          choice_id: string | null
          part_id: string
          question_id: string
          score: number
          updated_at: string
          updated_by: string
        }
        Insert: {
          academy_id: string
          annual_student_record_id: string
          assignment_id: string
          choice_id?: string | null
          part_id: string
          question_id: string
          score: number
          updated_at?: string
          updated_by: string
        }
        Update: {
          academy_id?: string
          annual_student_record_id?: string
          assignment_id?: string
          choice_id?: string | null
          part_id?: string
          question_id?: string
          score?: number
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_question_answers_academy_id_assignment_id_fkey"
            columns: ["academy_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "assignment_question_answers_assignment_id_annual_student_r_fkey"
            columns: ["assignment_id", "annual_student_record_id"]
            isOneToOne: false
            referencedRelation: "assignment_recipients"
            referencedColumns: ["assignment_id", "annual_student_record_id"]
          },
          {
            foreignKeyName: "assignment_question_answers_assignment_id_part_id_fkey"
            columns: ["assignment_id", "part_id"]
            isOneToOne: false
            referencedRelation: "assignment_parts"
            referencedColumns: ["assignment_id", "id"]
          },
          {
            foreignKeyName: "assignment_question_answers_part_id_question_id_fkey"
            columns: ["part_id", "question_id"]
            isOneToOne: false
            referencedRelation: "assignment_part_questions"
            referencedColumns: ["part_id", "id"]
          },
          {
            foreignKeyName: "assignment_question_answers_question_id_choice_id_fkey"
            columns: ["question_id", "choice_id"]
            isOneToOne: false
            referencedRelation: "assignment_question_choices"
            referencedColumns: ["question_id", "id"]
          },
          {
            foreignKeyName: "assignment_question_answers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_question_choices: {
        Row: {
          academy_id: string
          assignment_id: string
          id: string
          is_correct: boolean
          label: string
          part_id: string
          position: number
          question_id: string
        }
        Insert: {
          academy_id: string
          assignment_id: string
          id?: string
          is_correct?: boolean
          label?: string
          part_id: string
          position: number
          question_id: string
        }
        Update: {
          academy_id?: string
          assignment_id?: string
          id?: string
          is_correct?: boolean
          label?: string
          part_id?: string
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_question_choices_academy_id_assignment_id_fkey"
            columns: ["academy_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "assignment_question_choices_part_id_question_id_fkey"
            columns: ["part_id", "question_id"]
            isOneToOne: false
            referencedRelation: "assignment_part_questions"
            referencedColumns: ["part_id", "id"]
          },
        ]
      }
      assignment_recipients: {
        Row: {
          academic_year_id: string
          academy_id: string
          annual_student_record_id: string
          assignment_id: string
          created_at: string
          feedback: string
          published_revision: number
          received_at: string | null
          updated_at: string
          version: number
          work_note: string
          work_recorded_at: string | null
          work_recorded_by: string | null
          work_status: Database["public"]["Enums"]["assignment_work_status"]
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          annual_student_record_id: string
          assignment_id: string
          created_at?: string
          feedback?: string
          published_revision?: number
          received_at?: string | null
          updated_at?: string
          version?: number
          work_note?: string
          work_recorded_at?: string | null
          work_recorded_by?: string | null
          work_status?: Database["public"]["Enums"]["assignment_work_status"]
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          annual_student_record_id?: string
          assignment_id?: string
          created_at?: string
          feedback?: string
          published_revision?: number
          received_at?: string | null
          updated_at?: string
          version?: number
          work_note?: string
          work_recorded_at?: string | null
          work_recorded_by?: string | null
          work_status?: Database["public"]["Enums"]["assignment_work_status"]
        }
        Relationships: [
          {
            foreignKeyName: "assignment_recipients_academy_id_academic_year_id_annual_s_fkey"
            columns: [
              "academy_id",
              "academic_year_id",
              "annual_student_record_id",
            ]
            isOneToOne: false
            referencedRelation: "annual_student_records"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "assignment_recipients_academy_id_academic_year_id_assignme_fkey"
            columns: ["academy_id", "academic_year_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "assignment_recipients_work_recorded_by_fkey"
            columns: ["work_recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_requests: {
        Row: {
          academy_id: string
          actor_id: string
          assignment_id: string
          created_at: string
          fingerprint: string
          idempotency_key: string
          operation: string
          response: Json
        }
        Insert: {
          academy_id: string
          actor_id: string
          assignment_id: string
          created_at?: string
          fingerprint: string
          idempotency_key: string
          operation: string
          response: Json
        }
        Update: {
          academy_id?: string
          actor_id?: string
          assignment_id?: string
          created_at?: string
          fingerprint?: string
          idempotency_key?: string
          operation?: string
          response?: Json
        }
        Relationships: [
          {
            foreignKeyName: "assignment_requests_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_result_effects: {
        Row: {
          academy_id: string
          annual_student_record_id: string
          assignment_id: string
          created_at: string
          effect_type: Database["public"]["Enums"]["assignment_result_effect_type"]
          id: string
          processed_at: string | null
          publication_id: string
        }
        Insert: {
          academy_id: string
          annual_student_record_id: string
          assignment_id: string
          created_at?: string
          effect_type: Database["public"]["Enums"]["assignment_result_effect_type"]
          id?: string
          processed_at?: string | null
          publication_id: string
        }
        Update: {
          academy_id?: string
          annual_student_record_id?: string
          assignment_id?: string
          created_at?: string
          effect_type?: Database["public"]["Enums"]["assignment_result_effect_type"]
          id?: string
          processed_at?: string | null
          publication_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_result_effects_academy_id_publication_id_fkey"
            columns: ["academy_id", "publication_id"]
            isOneToOne: false
            referencedRelation: "assignment_result_publications"
            referencedColumns: ["academy_id", "id"]
          },
        ]
      }
      assignment_result_publications: {
        Row: {
          academic_year_id: string
          academy_id: string
          annual_student_record_id: string
          assignment_id: string
          content_hash: string
          feedback: string
          id: string
          marks: Json
          max_score: number
          previous_marks: Json | null
          previous_total: number | null
          previous_work_status:
            | Database["public"]["Enums"]["assignment_work_status"]
            | null
          published_at: string
          published_by: string
          revision: number
          scoring_revision: number | null
          total: number
          work_status: Database["public"]["Enums"]["assignment_work_status"]
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          annual_student_record_id: string
          assignment_id: string
          content_hash: string
          feedback: string
          id?: string
          marks: Json
          max_score: number
          previous_marks?: Json | null
          previous_total?: number | null
          previous_work_status?:
            | Database["public"]["Enums"]["assignment_work_status"]
            | null
          published_at?: string
          published_by: string
          revision: number
          scoring_revision?: number | null
          total: number
          work_status: Database["public"]["Enums"]["assignment_work_status"]
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          annual_student_record_id?: string
          assignment_id?: string
          content_hash?: string
          feedback?: string
          id?: string
          marks?: Json
          max_score?: number
          previous_marks?: Json | null
          previous_total?: number | null
          previous_work_status?:
            | Database["public"]["Enums"]["assignment_work_status"]
            | null
          published_at?: string
          published_by?: string
          revision?: number
          scoring_revision?: number | null
          total?: number
          work_status?: Database["public"]["Enums"]["assignment_work_status"]
        }
        Relationships: [
          {
            foreignKeyName: "assignment_result_publication_academy_id_academic_year_id__fkey"
            columns: ["academy_id", "academic_year_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "assignment_result_publication_assignment_id_annual_student_fkey"
            columns: ["assignment_id", "annual_student_record_id"]
            isOneToOne: false
            referencedRelation: "assignment_recipients"
            referencedColumns: ["assignment_id", "annual_student_record_id"]
          },
          {
            foreignKeyName: "assignment_result_publications_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_work_files: {
        Row: {
          actor_id: string
          assignment_id: string
          completed_at: string | null
          created_at: string
          generation: number
          id: string
          mime: string
          name: string
          part_id: string
          record_id: string
          sha256: string | null
          size: number
          state: string
          storage_path: string
          submission_id: string | null
        }
        Insert: {
          actor_id: string
          assignment_id: string
          completed_at?: string | null
          created_at?: string
          generation: number
          id?: string
          mime: string
          name: string
          part_id: string
          record_id: string
          sha256?: string | null
          size: number
          state?: string
          storage_path: string
          submission_id?: string | null
        }
        Update: {
          actor_id?: string
          assignment_id?: string
          completed_at?: string | null
          created_at?: string
          generation?: number
          id?: string
          mime?: string
          name?: string
          part_id?: string
          record_id?: string
          sha256?: string | null
          size?: number
          state?: string
          storage_path?: string
          submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_work_files_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_work_files_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_work_files_assignment_id_part_id_fkey"
            columns: ["assignment_id", "part_id"]
            isOneToOne: false
            referencedRelation: "assignment_parts"
            referencedColumns: ["assignment_id", "id"]
          },
          {
            foreignKeyName: "assignment_work_files_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "annual_student_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_work_files_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "assignment_online_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          academic_year_id: string
          academy_id: string
          archived_at: string | null
          archived_by: string | null
          audience: Database["public"]["Enums"]["assignment_audience"]
          closed_at: string | null
          closed_by: string | null
          cohort_revision: number
          created_at: string
          created_by: string
          due_at: string | null
          id: string
          instructions: string
          level_id: string | null
          max_score: number
          offering_closed_at: string | null
          part_count: number
          published_at: string | null
          published_by: string | null
          recipient_count: number
          scoring_revision: number
          state: Database["public"]["Enums"]["assignment_state"]
          title: string
          track_id: string | null
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          archived_at?: string | null
          archived_by?: string | null
          audience: Database["public"]["Enums"]["assignment_audience"]
          closed_at?: string | null
          closed_by?: string | null
          cohort_revision?: number
          created_at?: string
          created_by: string
          due_at?: string | null
          id: string
          instructions?: string
          level_id?: string | null
          max_score?: number
          offering_closed_at?: string | null
          part_count?: number
          published_at?: string | null
          published_by?: string | null
          recipient_count?: number
          scoring_revision?: number
          state?: Database["public"]["Enums"]["assignment_state"]
          title: string
          track_id?: string | null
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          archived_at?: string | null
          archived_by?: string | null
          audience?: Database["public"]["Enums"]["assignment_audience"]
          closed_at?: string | null
          closed_by?: string | null
          cohort_revision?: number
          created_at?: string
          created_by?: string
          due_at?: string | null
          id?: string
          instructions?: string
          level_id?: string | null
          max_score?: number
          offering_closed_at?: string | null
          part_count?: number
          published_at?: string | null
          published_by?: string | null
          recipient_count?: number
          scoring_revision?: number
          state?: Database["public"]["Enums"]["assignment_state"]
          title?: string
          track_id?: string | null
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "assignments_academy_id_academic_year_id_fkey"
            columns: ["academy_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "assignments_academy_id_level_id_fkey"
            columns: ["academy_id", "level_id"]
            isOneToOne: false
            referencedRelation: "academy_levels"
            referencedColumns: ["academy_id", "level_id"]
          },
          {
            foreignKeyName: "assignments_academy_id_level_id_track_id_fkey"
            columns: ["academy_id", "level_id", "track_id"]
            isOneToOne: false
            referencedRelation: "academy_tracks"
            referencedColumns: ["academy_id", "level_id", "id"]
          },
          {
            foreignKeyName: "assignments_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_effect_suppressions: {
        Row: {
          academy_id: string
          archive_event_id: number
          effect_id: string
          session_id: string
          suppressed_at: string
        }
        Insert: {
          academy_id: string
          archive_event_id: number
          effect_id: string
          session_id: string
          suppressed_at?: string
        }
        Update: {
          academy_id?: string
          archive_event_id?: number
          effect_id?: string
          session_id?: string
          suppressed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_effect_suppressions_archive_event_id_fkey"
            columns: ["archive_event_id"]
            isOneToOne: false
            referencedRelation: "session_archive_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_effect_suppressions_effect_id_fkey"
            columns: ["effect_id"]
            isOneToOne: true
            referencedRelation: "attendance_effects"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_effects: {
        Row: {
          academic_year_id: string
          academy_id: string
          annual_student_record_id: string
          created_at: string
          effect_type: Database["public"]["Enums"]["attendance_effect_type"]
          id: string
          processed_at: string | null
          publication_id: string
          reverses: Database["public"]["Enums"]["attendance_effect_type"] | null
          session_id: string
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          annual_student_record_id: string
          created_at?: string
          effect_type: Database["public"]["Enums"]["attendance_effect_type"]
          id?: string
          processed_at?: string | null
          publication_id: string
          reverses?:
            | Database["public"]["Enums"]["attendance_effect_type"]
            | null
          session_id: string
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          annual_student_record_id?: string
          created_at?: string
          effect_type?: Database["public"]["Enums"]["attendance_effect_type"]
          id?: string
          processed_at?: string | null
          publication_id?: string
          reverses?:
            | Database["public"]["Enums"]["attendance_effect_type"]
            | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_effects_academy_id_academic_year_id_publication_fkey"
            columns: ["academy_id", "academic_year_id", "publication_id"]
            isOneToOne: false
            referencedRelation: "attendance_publications"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "attendance_effects_session_id_annual_student_record_id_fkey"
            columns: ["session_id", "annual_student_record_id"]
            isOneToOne: false
            referencedRelation: "session_roster_entries"
            referencedColumns: ["session_id", "annual_student_record_id"]
          },
        ]
      }
      attendance_publication_items: {
        Row: {
          annual_student_record_id: string
          previous_status:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          publication_id: string
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
        }
        Insert: {
          annual_student_record_id: string
          previous_status?:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          publication_id: string
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
        }
        Update: {
          annual_student_record_id?: string
          previous_status?:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          publication_id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Relationships: [
          {
            foreignKeyName: "attendance_publication_items_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "attendance_publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_publication_items_session_id_annual_student_rec_fkey"
            columns: ["session_id", "annual_student_record_id"]
            isOneToOne: false
            referencedRelation: "session_roster_entries"
            referencedColumns: ["session_id", "annual_student_record_id"]
          },
        ]
      }
      attendance_publications: {
        Row: {
          academic_year_id: string
          academy_id: string
          id: string
          item_count: number
          kind: Database["public"]["Enums"]["attendance_publication_kind"]
          published_at: string
          published_by: string
          published_by_name: string | null
          revision: number
          sequence: number
          session_id: string
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          id?: string
          item_count: number
          kind: Database["public"]["Enums"]["attendance_publication_kind"]
          published_at?: string
          published_by: string
          published_by_name?: string | null
          revision: number
          sequence: number
          session_id: string
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          id?: string
          item_count?: number
          kind?: Database["public"]["Enums"]["attendance_publication_kind"]
          published_at?: string
          published_by?: string
          published_by_name?: string | null
          revision?: number
          sequence?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_publications_academy_id_academic_year_id_sessio_fkey"
            columns: ["academy_id", "academic_year_id", "session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "attendance_publications_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          academic_year_id: string
          academy_id: string
          annual_student_record_id: string
          checked_in_at: string | null
          checked_in_by: string | null
          published_at: string | null
          published_publication_id: string | null
          published_status:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          session_id: string
          source: Database["public"]["Enums"]["attendance_source"]
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          updated_by: string
          updated_by_name: string | null
          version: number
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          annual_student_record_id: string
          checked_in_at?: string | null
          checked_in_by?: string | null
          published_at?: string | null
          published_publication_id?: string | null
          published_status?:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          session_id: string
          source: Database["public"]["Enums"]["attendance_source"]
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          updated_by: string
          updated_by_name?: string | null
          version: number
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          annual_student_record_id?: string
          checked_in_at?: string | null
          checked_in_by?: string | null
          published_at?: string | null
          published_publication_id?: string | null
          published_status?:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          session_id?: string
          source?: Database["public"]["Enums"]["attendance_source"]
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          updated_by?: string
          updated_by_name?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_academy_id_academic_year_id_annual_stud_fkey"
            columns: [
              "academy_id",
              "academic_year_id",
              "annual_student_record_id",
            ]
            isOneToOne: false
            referencedRelation: "annual_student_records"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "attendance_records_academy_id_academic_year_id_session_id_fkey"
            columns: ["academy_id", "academic_year_id", "session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "attendance_records_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_publication_fkey"
            columns: ["published_publication_id"]
            isOneToOne: false
            referencedRelation: "attendance_publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_session_id_annual_student_record_id_fkey"
            columns: ["session_id", "annual_student_record_id"]
            isOneToOne: true
            referencedRelation: "session_roster_entries"
            referencedColumns: ["session_id", "annual_student_record_id"]
          },
          {
            foreignKeyName: "attendance_records_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_requests: {
        Row: {
          academy_id: string
          actor_id: string
          created_at: string
          fingerprint: string
          idempotency_key: string
          operation: string
          resolved: Json | null
          response: Json
          session_id: string
        }
        Insert: {
          academy_id: string
          actor_id: string
          created_at?: string
          fingerprint: string
          idempotency_key: string
          operation: string
          resolved?: Json | null
          response: Json
          session_id: string
        }
        Update: {
          academy_id?: string
          actor_id?: string
          created_at?: string
          fingerprint?: string
          idempotency_key?: string
          operation?: string
          resolved?: Json | null
          response?: Json
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_requests_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sheets: {
        Row: {
          academic_year_id: string
          academy_id: string
          last_published_at: string | null
          last_published_by: string | null
          last_published_by_name: string | null
          publication_count: number
          published_revision: number | null
          revision: number
          session_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          last_published_at?: string | null
          last_published_by?: string | null
          last_published_by_name?: string | null
          publication_count?: number
          published_revision?: number | null
          revision?: number
          session_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          last_published_at?: string | null
          last_published_by?: string | null
          last_published_by_name?: string | null
          publication_count?: number
          published_revision?: number | null
          revision?: number
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sheets_academy_id_academic_year_id_session_id_fkey"
            columns: ["academy_id", "academic_year_id", "session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "attendance_sheets_last_published_by_fkey"
            columns: ["last_published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_access_accounts: {
        Row: {
          academic_year_id: string
          academy_id: string
          annual_record_id: string
          current_grant_id: string | null
          unit_id: string
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          annual_record_id: string
          current_grant_id?: string | null
          unit_id: string
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          annual_record_id?: string
          current_grant_id?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_access_accounts_academy_id_academic_year_id_annual_fkey"
            columns: ["academy_id", "academic_year_id", "annual_record_id"]
            isOneToOne: false
            referencedRelation: "annual_student_records"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "content_access_accounts_academy_id_unit_id_fkey"
            columns: ["academy_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "content_units"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "content_access_accounts_current_grant_id_annual_record_id__fkey"
            columns: ["current_grant_id", "annual_record_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "content_access_grants"
            referencedColumns: ["id", "annual_record_id", "unit_id"]
          },
        ]
      }
      content_access_grants: {
        Row: {
          academic_year_id: string
          academy_id: string
          actor_id: string
          annual_record_id: string
          duration_seconds: number
          expires_at: string
          id: string
          issued_at: string
          kind: string
          previous_expiry: string | null
          previous_grant_id: string | null
          starts_at: string
          unit_id: string
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          actor_id: string
          annual_record_id: string
          duration_seconds: number
          expires_at: string
          id: string
          issued_at: string
          kind: string
          previous_expiry?: string | null
          previous_grant_id?: string | null
          starts_at: string
          unit_id: string
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          actor_id?: string
          annual_record_id?: string
          duration_seconds?: number
          expires_at?: string
          id?: string
          issued_at?: string
          kind?: string
          previous_expiry?: string | null
          previous_grant_id?: string | null
          starts_at?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_access_grants_academy_id_academic_year_id_annual_r_fkey"
            columns: [
              "academy_id",
              "academic_year_id",
              "annual_record_id",
              "unit_id",
            ]
            isOneToOne: false
            referencedRelation: "content_access_accounts"
            referencedColumns: [
              "academy_id",
              "academic_year_id",
              "annual_record_id",
              "unit_id",
            ]
          },
          {
            foreignKeyName: "content_access_grants_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_access_grants_previous_grant_id_fkey"
            columns: ["previous_grant_id"]
            isOneToOne: false
            referencedRelation: "content_access_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      content_access_revocations: {
        Row: {
          actor_id: string
          grant_id: string
          id: string
          reason: string
          revoked_at: string
        }
        Insert: {
          actor_id: string
          grant_id: string
          id: string
          reason: string
          revoked_at?: string
        }
        Update: {
          actor_id?: string
          grant_id?: string
          id?: string
          reason?: string
          revoked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_access_revocations_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_access_revocations_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: true
            referencedRelation: "content_access_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      content_assessments: {
        Row: {
          academy_id: string
          assessment_id: string
          kind: string
          unit_id: string
        }
        Insert: {
          academy_id: string
          assessment_id: string
          kind: string
          unit_id: string
        }
        Update: {
          academy_id?: string
          assessment_id?: string
          kind?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_assessments_academy_id_unit_id_fkey"
            columns: ["academy_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "content_units"
            referencedColumns: ["academy_id", "id"]
          },
        ]
      }
      content_assets: {
        Row: {
          academy_id: string
          created_at: string
          created_by: string
          deletion_token: string | null
          id: string
          kind: string
          mime_type: string
          name: string
          playback_id: string | null
          provider_asset_id: string | null
          provider_upload_id: string | null
          status: string
          storage_path: string | null
          unit_id: string
        }
        Insert: {
          academy_id: string
          created_at?: string
          created_by: string
          deletion_token?: string | null
          id: string
          kind: string
          mime_type: string
          name: string
          playback_id?: string | null
          provider_asset_id?: string | null
          provider_upload_id?: string | null
          status?: string
          storage_path?: string | null
          unit_id: string
        }
        Update: {
          academy_id?: string
          created_at?: string
          created_by?: string
          deletion_token?: string | null
          id?: string
          kind?: string
          mime_type?: string
          name?: string
          playback_id?: string | null
          provider_asset_id?: string | null
          provider_upload_id?: string | null
          status?: string
          storage_path?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_assets_academy_id_unit_id_fkey"
            columns: ["academy_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "content_units"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "content_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_coupon_batches: {
        Row: {
          academy_id: string
          created_at: string
          created_by: string
          id: string
          quantity: number
          type_id: string
        }
        Insert: {
          academy_id: string
          created_at?: string
          created_by: string
          id: string
          quantity: number
          type_id: string
        }
        Update: {
          academy_id?: string
          created_at?: string
          created_by?: string
          id?: string
          quantity?: number
          type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_coupon_batches_academy_id_type_id_fkey"
            columns: ["academy_id", "type_id"]
            isOneToOne: false
            referencedRelation: "content_coupon_types"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "content_coupon_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_coupon_redemptions: {
        Row: {
          annual_record_id: string
          coupon_id: string
          grant_id: string
          redeemed_at: string
          unit_id: string
        }
        Insert: {
          annual_record_id: string
          coupon_id: string
          grant_id: string
          redeemed_at?: string
          unit_id: string
        }
        Update: {
          annual_record_id?: string
          coupon_id?: string
          grant_id?: string
          redeemed_at?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_coupon_redemptions_annual_record_id_fkey"
            columns: ["annual_record_id"]
            isOneToOne: false
            referencedRelation: "annual_student_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: true
            referencedRelation: "content_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_coupon_redemptions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: true
            referencedRelation: "content_access_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_coupon_redemptions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "content_units"
            referencedColumns: ["id"]
          },
        ]
      }
      content_coupon_types: {
        Row: {
          academic_year_id: string
          academy_id: string
          created_at: string
          created_by: string
          id: string
          level_id: string
          name: string
          program_id: string
          track_id: string | null
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          created_at?: string
          created_by: string
          id?: string
          level_id: string
          name: string
          program_id: string
          track_id?: string | null
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          created_at?: string
          created_by?: string
          id?: string
          level_id?: string
          name?: string
          program_id?: string
          track_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_coupon_types_academy_id_academic_year_id_fkey"
            columns: ["academy_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "content_coupon_types_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_coupon_types_academy_id_level_id_fkey"
            columns: ["academy_id", "level_id"]
            isOneToOne: false
            referencedRelation: "academy_levels"
            referencedColumns: ["academy_id", "level_id"]
          },
          {
            foreignKeyName: "content_coupon_types_academy_id_level_id_track_id_fkey"
            columns: ["academy_id", "level_id", "track_id"]
            isOneToOne: false
            referencedRelation: "academy_tracks"
            referencedColumns: ["academy_id", "level_id", "id"]
          },
          {
            foreignKeyName: "content_coupon_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_coupon_types_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "content_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      content_coupons: {
        Row: {
          academy_id: string
          batch_id: string
          code: string
          id: string
          revoked_at: string | null
          revoked_by: string | null
          type_id: string
        }
        Insert: {
          academy_id: string
          batch_id: string
          code: string
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          type_id: string
        }
        Update: {
          academy_id?: string
          batch_id?: string
          code?: string
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_coupons_academy_id_type_id_batch_id_fkey"
            columns: ["academy_id", "type_id", "batch_id"]
            isOneToOne: false
            referencedRelation: "content_coupon_batches"
            referencedColumns: ["academy_id", "type_id", "id"]
          },
          {
            foreignKeyName: "content_coupons_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_feedback: {
        Row: {
          academy_id: string
          author_id: string
          body: string
          created_at: string
          id: string
          unit_id: string
        }
        Insert: {
          academy_id: string
          author_id: string
          body: string
          created_at?: string
          id?: string
          unit_id: string
        }
        Update: {
          academy_id?: string
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_feedback_academy_id_unit_id_fkey"
            columns: ["academy_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "content_units"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "content_feedback_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_programs: {
        Row: {
          academic_year_id: string
          academy_id: string
          id: string
          level_id: string
          original_track_name: string | null
          track_id: string | null
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          id?: string
          level_id: string
          original_track_name?: string | null
          track_id?: string | null
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          id?: string
          level_id?: string
          original_track_name?: string | null
          track_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_programs_academy_id_academic_year_id_fkey"
            columns: ["academy_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "content_programs_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_programs_academy_id_level_id_fkey"
            columns: ["academy_id", "level_id"]
            isOneToOne: false
            referencedRelation: "academy_levels"
            referencedColumns: ["academy_id", "level_id"]
          },
          {
            foreignKeyName: "content_programs_academy_id_level_id_track_id_fkey"
            columns: ["academy_id", "level_id", "track_id"]
            isOneToOne: false
            referencedRelation: "academy_tracks"
            referencedColumns: ["academy_id", "level_id", "id"]
          },
        ]
      }
      content_revisions: {
        Row: {
          academy_id: string
          document: Json
          published_at: string
          published_by: string
          revision: number
          unit_id: string
        }
        Insert: {
          academy_id: string
          document: Json
          published_at?: string
          published_by: string
          revision: number
          unit_id: string
        }
        Update: {
          academy_id?: string
          document?: Json
          published_at?: string
          published_by?: string
          revision?: number
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_revisions_academy_id_unit_id_fkey"
            columns: ["academy_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "content_units"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "content_revisions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_revisions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "content_units"
            referencedColumns: ["id"]
          },
        ]
      }
      content_units: {
        Row: {
          academy_id: string
          created_at: string
          created_by: string
          draft: Json
          id: string
          offering_epoch: number
          program_id: string
          published_revision: number
          published_version: number
          review_requested_at: string | null
          source_unit_id: string | null
          state: string
          updated_at: string
          version: number
        }
        Insert: {
          academy_id: string
          created_at?: string
          created_by: string
          draft: Json
          id: string
          offering_epoch?: number
          program_id: string
          published_revision?: number
          published_version?: number
          review_requested_at?: string | null
          source_unit_id?: string | null
          state?: string
          updated_at?: string
          version?: number
        }
        Update: {
          academy_id?: string
          created_at?: string
          created_by?: string
          draft?: Json
          id?: string
          offering_epoch?: number
          program_id?: string
          published_revision?: number
          published_version?: number
          review_requested_at?: string | null
          source_unit_id?: string | null
          state?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_units_academy_id_program_id_fkey"
            columns: ["academy_id", "program_id"]
            isOneToOne: false
            referencedRelation: "content_programs"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "content_units_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_units_source_unit_id_fkey"
            columns: ["source_unit_id"]
            isOneToOne: false
            referencedRelation: "content_units"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_attempts: {
        Row: {
          academy_id: string
          annual_student_record_id: string
          answers_version: number
          deadline_at: string
          departure_count: number
          exam_id: string
          finalization_reason:
            | Database["public"]["Enums"]["exam_finalization_reason"]
            | null
          finalized_at: string | null
          id: string
          last_saved_at: string | null
          started_at: string
          superseded_at: string | null
        }
        Insert: {
          academy_id: string
          annual_student_record_id: string
          answers_version?: number
          deadline_at: string
          departure_count?: number
          exam_id: string
          finalization_reason?:
            | Database["public"]["Enums"]["exam_finalization_reason"]
            | null
          finalized_at?: string | null
          id?: string
          last_saved_at?: string | null
          started_at: string
          superseded_at?: string | null
        }
        Update: {
          academy_id?: string
          annual_student_record_id?: string
          answers_version?: number
          deadline_at?: string
          departure_count?: number
          exam_id?: string
          finalization_reason?:
            | Database["public"]["Enums"]["exam_finalization_reason"]
            | null
          finalized_at?: string | null
          id?: string
          last_saved_at?: string | null
          started_at?: string
          superseded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_attempts_academy_id_exam_id_fkey"
            columns: ["academy_id", "exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "exam_attempts_exam_id_annual_student_record_id_fkey"
            columns: ["exam_id", "annual_student_record_id"]
            isOneToOne: true
            referencedRelation: "exam_work"
            referencedColumns: ["exam_id", "annual_student_record_id"]
          },
        ]
      }
      exam_audience_groups: {
        Row: {
          academic_year_id: string
          academy_id: string
          exam_id: string
          group_id: string
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          exam_id: string
          group_id: string
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          exam_id?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_audience_groups_academy_id_academic_year_id_exam_id_fkey"
            columns: ["academy_id", "academic_year_id", "exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "exam_audience_groups_academy_id_academic_year_id_group_id_fkey"
            columns: ["academy_id", "academic_year_id", "group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
        ]
      }
      exam_choices: {
        Row: {
          academy_id: string
          exam_id: string
          id: string
          is_correct: boolean
          label: string
          position: number
          question_id: string
        }
        Insert: {
          academy_id: string
          exam_id: string
          id?: string
          is_correct?: boolean
          label?: string
          position: number
          question_id: string
        }
        Update: {
          academy_id?: string
          exam_id?: string
          id?: string
          is_correct?: boolean
          label?: string
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_choices_academy_id_exam_id_fkey"
            columns: ["academy_id", "exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "exam_choices_exam_id_question_id_fkey"
            columns: ["exam_id", "question_id"]
            isOneToOne: false
            referencedRelation: "exam_questions"
            referencedColumns: ["exam_id", "id"]
          },
        ]
      }
      exam_closures: {
        Row: {
          academy_id: string
          closed_at: string
          exam_id: string
          settled_at: string
        }
        Insert: {
          academy_id: string
          closed_at: string
          exam_id: string
          settled_at: string
        }
        Update: {
          academy_id?: string
          closed_at?: string
          exam_id?: string
          settled_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_closures_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: true
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_corrections: {
        Row: {
          academy_id: string
          choice_id: string | null
          created_at: string
          created_by: string
          exam_id: string
          id: string
          kind: Database["public"]["Enums"]["exam_correction_kind"]
          previous_choice_id: string | null
          question_id: string
          revision: number
        }
        Insert: {
          academy_id: string
          choice_id?: string | null
          created_at?: string
          created_by: string
          exam_id: string
          id?: string
          kind: Database["public"]["Enums"]["exam_correction_kind"]
          previous_choice_id?: string | null
          question_id: string
          revision: number
        }
        Update: {
          academy_id?: string
          choice_id?: string | null
          created_at?: string
          created_by?: string
          exam_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["exam_correction_kind"]
          previous_choice_id?: string | null
          question_id?: string
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_corrections_academy_id_exam_id_fkey"
            columns: ["academy_id", "exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "exam_corrections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_corrections_exam_id_question_id_fkey"
            columns: ["exam_id", "question_id"]
            isOneToOne: false
            referencedRelation: "exam_questions"
            referencedColumns: ["exam_id", "id"]
          },
        ]
      }
      exam_departures: {
        Row: {
          academy_id: string
          attempt_id: string
          event_id: string
          exam_id: string
          next_question_id: string | null
          ordinal: number
          outcome: string
          question_id: string | null
          question_number: number | null
          recorded_at: string
        }
        Insert: {
          academy_id: string
          attempt_id: string
          event_id: string
          exam_id: string
          next_question_id?: string | null
          ordinal: number
          outcome: string
          question_id?: string | null
          question_number?: number | null
          recorded_at: string
        }
        Update: {
          academy_id?: string
          attempt_id?: string
          event_id?: string
          exam_id?: string
          next_question_id?: string | null
          ordinal?: number
          outcome?: string
          question_id?: string | null
          question_number?: number | null
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_departures_academy_id_exam_id_fkey"
            columns: ["academy_id", "exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "exam_departures_exam_id_attempt_id_fkey"
            columns: ["exam_id", "attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["exam_id", "id"]
          },
          {
            foreignKeyName: "exam_departures_exam_id_next_question_id_fkey"
            columns: ["exam_id", "next_question_id"]
            isOneToOne: false
            referencedRelation: "exam_questions"
            referencedColumns: ["exam_id", "id"]
          },
          {
            foreignKeyName: "exam_departures_exam_id_question_id_fkey"
            columns: ["exam_id", "question_id"]
            isOneToOne: false
            referencedRelation: "exam_questions"
            referencedColumns: ["exam_id", "id"]
          },
        ]
      }
      exam_editor_claims: {
        Row: {
          academy_id: string
          attempt_id: string
          claimed_at: string
          exam_id: string
          expires_at: string
          generation: number
          renewed_at: string
          token_hash: string
        }
        Insert: {
          academy_id: string
          attempt_id: string
          claimed_at: string
          exam_id: string
          expires_at: string
          generation: number
          renewed_at: string
          token_hash: string
        }
        Update: {
          academy_id?: string
          attempt_id?: string
          claimed_at?: string
          exam_id?: string
          expires_at?: string
          generation?: number
          renewed_at?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_editor_claims_academy_id_exam_id_fkey"
            columns: ["academy_id", "exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "exam_editor_claims_exam_id_attempt_id_fkey"
            columns: ["exam_id", "attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["exam_id", "id"]
          },
        ]
      }
      exam_marks: {
        Row: {
          academy_id: string
          annual_student_record_id: string
          exam_id: string
          question_id: string
          score: number
          updated_at: string
          updated_by: string
        }
        Insert: {
          academy_id: string
          annual_student_record_id: string
          exam_id: string
          question_id: string
          score: number
          updated_at: string
          updated_by: string
        }
        Update: {
          academy_id?: string
          annual_student_record_id?: string
          exam_id?: string
          question_id?: string
          score?: number
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_marks_exam_id_annual_student_record_id_fkey"
            columns: ["exam_id", "annual_student_record_id"]
            isOneToOne: false
            referencedRelation: "exam_work"
            referencedColumns: ["exam_id", "annual_student_record_id"]
          },
          {
            foreignKeyName: "exam_marks_exam_id_question_id_fkey"
            columns: ["exam_id", "question_id"]
            isOneToOne: false
            referencedRelation: "exam_questions"
            referencedColumns: ["exam_id", "id"]
          },
          {
            foreignKeyName: "exam_marks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_online_answers: {
        Row: {
          academy_id: string
          attempt_id: string
          choice_id: string | null
          exam_id: string
          question_id: string
          saved_at: string
          text_answer: string | null
        }
        Insert: {
          academy_id: string
          attempt_id: string
          choice_id?: string | null
          exam_id: string
          question_id: string
          saved_at: string
          text_answer?: string | null
        }
        Update: {
          academy_id?: string
          attempt_id?: string
          choice_id?: string | null
          exam_id?: string
          question_id?: string
          saved_at?: string
          text_answer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_online_answers_exam_id_attempt_id_fkey"
            columns: ["exam_id", "attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["exam_id", "id"]
          },
          {
            foreignKeyName: "exam_online_answers_exam_id_question_id_fkey"
            columns: ["exam_id", "question_id"]
            isOneToOne: false
            referencedRelation: "exam_questions"
            referencedColumns: ["exam_id", "id"]
          },
          {
            foreignKeyName: "exam_online_answers_question_id_choice_id_fkey"
            columns: ["question_id", "choice_id"]
            isOneToOne: false
            referencedRelation: "exam_choices"
            referencedColumns: ["question_id", "id"]
          },
        ]
      }
      exam_parts: {
        Row: {
          academy_id: string
          exam_id: string
          id: string
          instructions: string
          kind: Database["public"]["Enums"]["exam_part_kind"]
          position: number
          title: string
        }
        Insert: {
          academy_id: string
          exam_id: string
          id?: string
          instructions?: string
          kind: Database["public"]["Enums"]["exam_part_kind"]
          position: number
          title: string
        }
        Update: {
          academy_id?: string
          exam_id?: string
          id?: string
          instructions?: string
          kind?: Database["public"]["Enums"]["exam_part_kind"]
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_parts_academy_id_exam_id_fkey"
            columns: ["academy_id", "exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["academy_id", "id"]
          },
        ]
      }
      exam_physical_answers: {
        Row: {
          academy_id: string
          annual_student_record_id: string
          choice_id: string | null
          exam_id: string
          question_id: string
        }
        Insert: {
          academy_id: string
          annual_student_record_id: string
          choice_id?: string | null
          exam_id: string
          question_id: string
        }
        Update: {
          academy_id?: string
          annual_student_record_id?: string
          choice_id?: string | null
          exam_id?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_physical_answers_exam_id_annual_student_record_id_fkey"
            columns: ["exam_id", "annual_student_record_id"]
            isOneToOne: false
            referencedRelation: "exam_physical_drafts"
            referencedColumns: ["exam_id", "annual_student_record_id"]
          },
          {
            foreignKeyName: "exam_physical_answers_exam_id_question_id_fkey"
            columns: ["exam_id", "question_id"]
            isOneToOne: false
            referencedRelation: "exam_questions"
            referencedColumns: ["exam_id", "id"]
          },
          {
            foreignKeyName: "exam_physical_answers_question_id_choice_id_fkey"
            columns: ["question_id", "choice_id"]
            isOneToOne: false
            referencedRelation: "exam_choices"
            referencedColumns: ["question_id", "id"]
          },
        ]
      }
      exam_physical_drafts: {
        Row: {
          academy_id: string
          annual_student_record_id: string
          exam_id: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          academy_id: string
          annual_student_record_id: string
          exam_id: string
          updated_at: string
          updated_by: string
          version?: number
        }
        Update: {
          academy_id?: string
          annual_student_record_id?: string
          exam_id?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_physical_drafts_academy_id_exam_id_fkey"
            columns: ["academy_id", "exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "exam_physical_drafts_exam_id_annual_student_record_id_fkey"
            columns: ["exam_id", "annual_student_record_id"]
            isOneToOne: true
            referencedRelation: "exam_work"
            referencedColumns: ["exam_id", "annual_student_record_id"]
          },
          {
            foreignKeyName: "exam_physical_drafts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          academy_id: string
          exam_id: string
          excluded_at: string | null
          excluded_by: string | null
          excluded_revision: number | null
          id: string
          max_score: number
          model_answer: string
          part_id: string
          position: number
          prompt: string
        }
        Insert: {
          academy_id: string
          exam_id: string
          excluded_at?: string | null
          excluded_by?: string | null
          excluded_revision?: number | null
          id?: string
          max_score: number
          model_answer?: string
          part_id: string
          position: number
          prompt?: string
        }
        Update: {
          academy_id?: string
          exam_id?: string
          excluded_at?: string | null
          excluded_by?: string | null
          excluded_revision?: number | null
          id?: string
          max_score?: number
          model_answer?: string
          part_id?: string
          position?: number
          prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_questions_academy_id_exam_id_fkey"
            columns: ["academy_id", "exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "exam_questions_exam_id_part_id_fkey"
            columns: ["exam_id", "part_id"]
            isOneToOne: false
            referencedRelation: "exam_parts"
            referencedColumns: ["exam_id", "id"]
          },
          {
            foreignKeyName: "exam_questions_excluded_by_fkey"
            columns: ["excluded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_requests: {
        Row: {
          academy_id: string
          actor_id: string
          created_at: string
          exam_id: string
          fingerprint: string
          idempotency_key: string
          operation: string
          response: Json
        }
        Insert: {
          academy_id: string
          actor_id: string
          created_at?: string
          exam_id: string
          fingerprint: string
          idempotency_key: string
          operation: string
          response: Json
        }
        Update: {
          academy_id?: string
          actor_id?: string
          created_at?: string
          exam_id?: string
          fingerprint?: string
          idempotency_key?: string
          operation?: string
          response?: Json
        }
        Relationships: [
          {
            foreignKeyName: "exam_requests_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_result_effects: {
        Row: {
          academy_id: string
          annual_student_record_id: string
          created_at: string
          effect_type: Database["public"]["Enums"]["exam_effect_type"]
          exam_id: string
          id: string
          processed_at: string | null
          publication_id: string | null
        }
        Insert: {
          academy_id: string
          annual_student_record_id: string
          created_at?: string
          effect_type: Database["public"]["Enums"]["exam_effect_type"]
          exam_id: string
          id?: string
          processed_at?: string | null
          publication_id?: string | null
        }
        Update: {
          academy_id?: string
          annual_student_record_id?: string
          created_at?: string
          effect_type?: Database["public"]["Enums"]["exam_effect_type"]
          exam_id?: string
          id?: string
          processed_at?: string | null
          publication_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_result_effects_academy_id_publication_id_fkey"
            columns: ["academy_id", "publication_id"]
            isOneToOne: false
            referencedRelation: "exam_result_publications"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "exam_result_effects_exam_id_annual_student_record_id_fkey"
            columns: ["exam_id", "annual_student_record_id"]
            isOneToOne: false
            referencedRelation: "exam_work"
            referencedColumns: ["exam_id", "annual_student_record_id"]
          },
        ]
      }
      exam_result_publications: {
        Row: {
          academic_year_id: string
          academy_id: string
          annual_student_record_id: string
          automatic: boolean
          content_hash: string
          exam_id: string
          feedback: string
          id: string
          items: Json
          max_score: number
          previous_publication_id: string | null
          published_at: string
          published_by: string | null
          revision: number
          scoring_revision: number
          total: number
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          annual_student_record_id: string
          automatic: boolean
          content_hash: string
          exam_id: string
          feedback: string
          id?: string
          items: Json
          max_score: number
          previous_publication_id?: string | null
          published_at?: string
          published_by?: string | null
          revision: number
          scoring_revision: number
          total: number
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          annual_student_record_id?: string
          automatic?: boolean
          content_hash?: string
          exam_id?: string
          feedback?: string
          id?: string
          items?: Json
          max_score?: number
          previous_publication_id?: string | null
          published_at?: string
          published_by?: string | null
          revision?: number
          scoring_revision?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_result_publications_academy_id_academic_year_id_exam__fkey"
            columns: ["academy_id", "academic_year_id", "exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "exam_result_publications_exam_id_annual_student_record_id_fkey"
            columns: ["exam_id", "annual_student_record_id"]
            isOneToOne: false
            referencedRelation: "exam_work"
            referencedColumns: ["exam_id", "annual_student_record_id"]
          },
          {
            foreignKeyName: "exam_result_publications_previous_publication_id_fkey"
            columns: ["previous_publication_id"]
            isOneToOne: false
            referencedRelation: "exam_result_publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_result_publications_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_submission_answers: {
        Row: {
          academy_id: string
          choice_id: string | null
          exam_id: string
          question_id: string
          submission_id: string
          text_answer: string | null
        }
        Insert: {
          academy_id: string
          choice_id?: string | null
          exam_id: string
          question_id: string
          submission_id: string
          text_answer?: string | null
        }
        Update: {
          academy_id?: string
          choice_id?: string | null
          exam_id?: string
          question_id?: string
          submission_id?: string
          text_answer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_submission_answers_exam_id_question_id_fkey"
            columns: ["exam_id", "question_id"]
            isOneToOne: false
            referencedRelation: "exam_questions"
            referencedColumns: ["exam_id", "id"]
          },
          {
            foreignKeyName: "exam_submission_answers_question_id_choice_id_fkey"
            columns: ["question_id", "choice_id"]
            isOneToOne: false
            referencedRelation: "exam_choices"
            referencedColumns: ["question_id", "id"]
          },
          {
            foreignKeyName: "exam_submission_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "exam_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_submissions: {
        Row: {
          academic_year_id: string
          academy_id: string
          annual_student_record_id: string
          attempt_id: string | null
          confirmed_by: string | null
          exam_id: string
          id: string
          original_deadline_at: string | null
          processed_at: string
          reason: Database["public"]["Enums"]["exam_finalization_reason"]
          scoring_revision: number
          source: Database["public"]["Enums"]["exam_source"]
          submitted_at: string
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          annual_student_record_id: string
          attempt_id?: string | null
          confirmed_by?: string | null
          exam_id: string
          id?: string
          original_deadline_at?: string | null
          processed_at: string
          reason: Database["public"]["Enums"]["exam_finalization_reason"]
          scoring_revision: number
          source: Database["public"]["Enums"]["exam_source"]
          submitted_at: string
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          annual_student_record_id?: string
          attempt_id?: string | null
          confirmed_by?: string | null
          exam_id?: string
          id?: string
          original_deadline_at?: string | null
          processed_at?: string
          reason?: Database["public"]["Enums"]["exam_finalization_reason"]
          scoring_revision?: number
          source?: Database["public"]["Enums"]["exam_source"]
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_submissions_academy_id_academic_year_id_exam_id_fkey"
            columns: ["academy_id", "academic_year_id", "exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "exam_submissions_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_submissions_exam_id_annual_student_record_id_fkey"
            columns: ["exam_id", "annual_student_record_id"]
            isOneToOne: true
            referencedRelation: "exam_work"
            referencedColumns: ["exam_id", "annual_student_record_id"]
          },
          {
            foreignKeyName: "exam_submissions_exam_id_attempt_id_fkey"
            columns: ["exam_id", "attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["exam_id", "id"]
          },
        ]
      }
      exam_work: {
        Row: {
          academic_year_id: string
          academy_id: string
          accepted_source: Database["public"]["Enums"]["exam_source"] | null
          accepted_submission_id: string | null
          annual_student_record_id: string
          created_at: string
          exam_id: string
          feedback: string
          published_revision: number
          solutions_qualified_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          accepted_source?: Database["public"]["Enums"]["exam_source"] | null
          accepted_submission_id?: string | null
          annual_student_record_id: string
          created_at?: string
          exam_id: string
          feedback?: string
          published_revision?: number
          solutions_qualified_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          accepted_source?: Database["public"]["Enums"]["exam_source"] | null
          accepted_submission_id?: string | null
          annual_student_record_id?: string
          created_at?: string
          exam_id?: string
          feedback?: string
          published_revision?: number
          solutions_qualified_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_work_academy_id_academic_year_id_annual_student_recor_fkey"
            columns: [
              "academy_id",
              "academic_year_id",
              "annual_student_record_id",
            ]
            isOneToOne: false
            referencedRelation: "annual_student_records"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "exam_work_academy_id_academic_year_id_exam_id_fkey"
            columns: ["academy_id", "academic_year_id", "exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "exam_work_submission_fk"
            columns: ["exam_id", "accepted_submission_id"]
            isOneToOne: false
            referencedRelation: "exam_submissions"
            referencedColumns: ["exam_id", "id"]
          },
        ]
      }
      exams: {
        Row: {
          academic_year_id: string
          academy_id: string
          actual_closes_at: string | null
          archived_at: string | null
          archived_by: string | null
          audience: Database["public"]["Enums"]["exam_audience"] | null
          availability_updated_at: string | null
          availability_updated_by: string | null
          closes_at: string | null
          created_at: string
          created_by: string
          id: string
          instructions: string
          level_id: string | null
          max_score: number
          offering_closed_at: string | null
          opens_at: string | null
          question_count: number
          roster_frozen_at: string | null
          roster_frozen_by: string | null
          scoring_revision: number
          solution_notes: string
          structure_locked_at: string | null
          time_limit_minutes: number | null
          title: string
          track_id: string | null
          updated_at: string
          updated_by: string
          version: number
          work_started_at: string | null
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          actual_closes_at?: string | null
          archived_at?: string | null
          archived_by?: string | null
          audience?: Database["public"]["Enums"]["exam_audience"] | null
          availability_updated_at?: string | null
          availability_updated_by?: string | null
          closes_at?: string | null
          created_at?: string
          created_by: string
          id: string
          instructions?: string
          level_id?: string | null
          max_score?: number
          offering_closed_at?: string | null
          opens_at?: string | null
          question_count?: number
          roster_frozen_at?: string | null
          roster_frozen_by?: string | null
          scoring_revision?: number
          solution_notes?: string
          structure_locked_at?: string | null
          time_limit_minutes?: number | null
          title: string
          track_id?: string | null
          updated_at?: string
          updated_by: string
          version?: number
          work_started_at?: string | null
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          actual_closes_at?: string | null
          archived_at?: string | null
          archived_by?: string | null
          audience?: Database["public"]["Enums"]["exam_audience"] | null
          availability_updated_at?: string | null
          availability_updated_by?: string | null
          closes_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          instructions?: string
          level_id?: string | null
          max_score?: number
          offering_closed_at?: string | null
          opens_at?: string | null
          question_count?: number
          roster_frozen_at?: string | null
          roster_frozen_by?: string | null
          scoring_revision?: number
          solution_notes?: string
          structure_locked_at?: string | null
          time_limit_minutes?: number | null
          title?: string
          track_id?: string | null
          updated_at?: string
          updated_by?: string
          version?: number
          work_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exams_academy_id_academic_year_id_fkey"
            columns: ["academy_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "exams_academy_id_level_id_fkey"
            columns: ["academy_id", "level_id"]
            isOneToOne: false
            referencedRelation: "academy_levels"
            referencedColumns: ["academy_id", "level_id"]
          },
          {
            foreignKeyName: "exams_academy_id_level_id_track_id_fkey"
            columns: ["academy_id", "level_id", "track_id"]
            isOneToOne: false
            referencedRelation: "academy_tracks"
            referencedColumns: ["academy_id", "level_id", "id"]
          },
          {
            foreignKeyName: "exams_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_availability_updated_by_fkey"
            columns: ["availability_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_roster_frozen_by_fkey"
            columns: ["roster_frozen_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_updated_by_fkey"
            columns: ["updated_by"]
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
          replaced_by: string | null
          selectable: boolean
          sort_order: number
        }
        Insert: {
          id: string
          name: string
          replaced_by?: string | null
          selectable?: boolean
          sort_order: number
        }
        Update: {
          id?: string
          name?: string
          replaced_by?: string | null
          selectable?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "global_levels_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "global_levels"
            referencedColumns: ["id"]
          },
        ]
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
          retired_track_id: string | null
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
          retired_track_id?: string | null
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
          retired_track_id?: string | null
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
          {
            foreignKeyName: "groups_retired_track_id_fkey"
            columns: ["retired_track_id"]
            isOneToOne: false
            referencedRelation: "academy_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quiz_attempts: {
        Row: {
          academy_id: string
          annual_student_record_id: string
          answers_version: number
          deadline_at: string | null
          departure_count: number
          finalization_reason:
            | Database["public"]["Enums"]["quiz_finalization_reason"]
            | null
          finalized_at: string | null
          id: string
          last_saved_at: string | null
          quiz_id: string
          started_at: string
          superseded_at: string | null
        }
        Insert: {
          academy_id: string
          annual_student_record_id: string
          answers_version?: number
          deadline_at?: string | null
          departure_count?: number
          finalization_reason?:
            | Database["public"]["Enums"]["quiz_finalization_reason"]
            | null
          finalized_at?: string | null
          id?: string
          last_saved_at?: string | null
          quiz_id: string
          started_at: string
          superseded_at?: string | null
        }
        Update: {
          academy_id?: string
          annual_student_record_id?: string
          answers_version?: number
          deadline_at?: string | null
          departure_count?: number
          finalization_reason?:
            | Database["public"]["Enums"]["quiz_finalization_reason"]
            | null
          finalized_at?: string | null
          id?: string
          last_saved_at?: string | null
          quiz_id?: string
          started_at?: string
          superseded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_academy_id_quiz_id_fkey"
            columns: ["academy_id", "quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "quiz_attempts_quiz_id_annual_student_record_id_fkey"
            columns: ["quiz_id", "annual_student_record_id"]
            isOneToOne: true
            referencedRelation: "quiz_work"
            referencedColumns: ["quiz_id", "annual_student_record_id"]
          },
        ]
      }
      quiz_audience_groups: {
        Row: {
          academic_year_id: string
          academy_id: string
          group_id: string
          quiz_id: string
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          group_id: string
          quiz_id: string
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          group_id?: string
          quiz_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_audience_groups_academy_id_academic_year_id_group_id_fkey"
            columns: ["academy_id", "academic_year_id", "group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "quiz_audience_groups_academy_id_academic_year_id_quiz_id_fkey"
            columns: ["academy_id", "academic_year_id", "quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
        ]
      }
      quiz_choices: {
        Row: {
          academy_id: string
          id: string
          is_correct: boolean
          label: string
          position: number
          question_id: string
          quiz_id: string
        }
        Insert: {
          academy_id: string
          id?: string
          is_correct?: boolean
          label?: string
          position: number
          question_id: string
          quiz_id: string
        }
        Update: {
          academy_id?: string
          id?: string
          is_correct?: boolean
          label?: string
          position?: number
          question_id?: string
          quiz_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_choices_academy_id_quiz_id_fkey"
            columns: ["academy_id", "quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "quiz_choices_quiz_id_question_id_fkey"
            columns: ["quiz_id", "question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["quiz_id", "id"]
          },
        ]
      }
      quiz_closures: {
        Row: {
          academy_id: string
          closed_at: string
          quiz_id: string
          settled_at: string
        }
        Insert: {
          academy_id: string
          closed_at: string
          quiz_id: string
          settled_at: string
        }
        Update: {
          academy_id?: string
          closed_at?: string
          quiz_id?: string
          settled_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_closures_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: true
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_corrections: {
        Row: {
          academy_id: string
          choice_id: string | null
          created_at: string
          created_by: string
          id: string
          kind: Database["public"]["Enums"]["quiz_correction_kind"]
          previous_choice_id: string | null
          question_id: string
          quiz_id: string
          revision: number
        }
        Insert: {
          academy_id: string
          choice_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          kind: Database["public"]["Enums"]["quiz_correction_kind"]
          previous_choice_id?: string | null
          question_id: string
          quiz_id: string
          revision: number
        }
        Update: {
          academy_id?: string
          choice_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          kind?: Database["public"]["Enums"]["quiz_correction_kind"]
          previous_choice_id?: string | null
          question_id?: string
          quiz_id?: string
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_corrections_academy_id_quiz_id_fkey"
            columns: ["academy_id", "quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "quiz_corrections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_corrections_quiz_id_question_id_fkey"
            columns: ["quiz_id", "question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["quiz_id", "id"]
          },
        ]
      }
      quiz_departures: {
        Row: {
          attempt_id: string
          event_id: string
          recorded_at: string
        }
        Insert: {
          attempt_id: string
          event_id: string
          recorded_at: string
        }
        Update: {
          attempt_id?: string
          event_id?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_departures_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "quiz_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_marks: {
        Row: {
          academy_id: string
          annual_student_record_id: string
          question_id: string
          quiz_id: string
          score: number
          updated_at: string
          updated_by: string
        }
        Insert: {
          academy_id: string
          annual_student_record_id: string
          question_id: string
          quiz_id: string
          score: number
          updated_at: string
          updated_by: string
        }
        Update: {
          academy_id?: string
          annual_student_record_id?: string
          question_id?: string
          quiz_id?: string
          score?: number
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_marks_quiz_id_annual_student_record_id_fkey"
            columns: ["quiz_id", "annual_student_record_id"]
            isOneToOne: false
            referencedRelation: "quiz_work"
            referencedColumns: ["quiz_id", "annual_student_record_id"]
          },
          {
            foreignKeyName: "quiz_marks_quiz_id_question_id_fkey"
            columns: ["quiz_id", "question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["quiz_id", "id"]
          },
          {
            foreignKeyName: "quiz_marks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_online_answers: {
        Row: {
          academy_id: string
          attempt_id: string
          choice_id: string | null
          question_id: string
          quiz_id: string
          saved_at: string
          text_answer: string | null
        }
        Insert: {
          academy_id: string
          attempt_id: string
          choice_id?: string | null
          question_id: string
          quiz_id: string
          saved_at: string
          text_answer?: string | null
        }
        Update: {
          academy_id?: string
          attempt_id?: string
          choice_id?: string | null
          question_id?: string
          quiz_id?: string
          saved_at?: string
          text_answer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_online_answers_question_id_choice_id_fkey"
            columns: ["question_id", "choice_id"]
            isOneToOne: false
            referencedRelation: "quiz_choices"
            referencedColumns: ["question_id", "id"]
          },
          {
            foreignKeyName: "quiz_online_answers_quiz_id_attempt_id_fkey"
            columns: ["quiz_id", "attempt_id"]
            isOneToOne: false
            referencedRelation: "quiz_attempts"
            referencedColumns: ["quiz_id", "id"]
          },
          {
            foreignKeyName: "quiz_online_answers_quiz_id_question_id_fkey"
            columns: ["quiz_id", "question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["quiz_id", "id"]
          },
        ]
      }
      quiz_parts: {
        Row: {
          academy_id: string
          id: string
          instructions: string
          kind: Database["public"]["Enums"]["quiz_part_kind"]
          position: number
          quiz_id: string
          title: string
        }
        Insert: {
          academy_id: string
          id?: string
          instructions?: string
          kind: Database["public"]["Enums"]["quiz_part_kind"]
          position: number
          quiz_id: string
          title: string
        }
        Update: {
          academy_id?: string
          id?: string
          instructions?: string
          kind?: Database["public"]["Enums"]["quiz_part_kind"]
          position?: number
          quiz_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_parts_academy_id_quiz_id_fkey"
            columns: ["academy_id", "quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["academy_id", "id"]
          },
        ]
      }
      quiz_physical_answers: {
        Row: {
          academy_id: string
          annual_student_record_id: string
          choice_id: string | null
          question_id: string
          quiz_id: string
        }
        Insert: {
          academy_id: string
          annual_student_record_id: string
          choice_id?: string | null
          question_id: string
          quiz_id: string
        }
        Update: {
          academy_id?: string
          annual_student_record_id?: string
          choice_id?: string | null
          question_id?: string
          quiz_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_physical_answers_question_id_choice_id_fkey"
            columns: ["question_id", "choice_id"]
            isOneToOne: false
            referencedRelation: "quiz_choices"
            referencedColumns: ["question_id", "id"]
          },
          {
            foreignKeyName: "quiz_physical_answers_quiz_id_annual_student_record_id_fkey"
            columns: ["quiz_id", "annual_student_record_id"]
            isOneToOne: false
            referencedRelation: "quiz_physical_drafts"
            referencedColumns: ["quiz_id", "annual_student_record_id"]
          },
          {
            foreignKeyName: "quiz_physical_answers_quiz_id_question_id_fkey"
            columns: ["quiz_id", "question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["quiz_id", "id"]
          },
        ]
      }
      quiz_physical_drafts: {
        Row: {
          academy_id: string
          annual_student_record_id: string
          quiz_id: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          academy_id: string
          annual_student_record_id: string
          quiz_id: string
          updated_at: string
          updated_by: string
          version?: number
        }
        Update: {
          academy_id?: string
          annual_student_record_id?: string
          quiz_id?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_physical_drafts_academy_id_quiz_id_fkey"
            columns: ["academy_id", "quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "quiz_physical_drafts_quiz_id_annual_student_record_id_fkey"
            columns: ["quiz_id", "annual_student_record_id"]
            isOneToOne: true
            referencedRelation: "quiz_work"
            referencedColumns: ["quiz_id", "annual_student_record_id"]
          },
          {
            foreignKeyName: "quiz_physical_drafts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          academy_id: string
          excluded_at: string | null
          excluded_by: string | null
          excluded_revision: number | null
          id: string
          max_score: number
          model_answer: string
          part_id: string
          position: number
          prompt: string
          quiz_id: string
        }
        Insert: {
          academy_id: string
          excluded_at?: string | null
          excluded_by?: string | null
          excluded_revision?: number | null
          id?: string
          max_score: number
          model_answer?: string
          part_id: string
          position: number
          prompt?: string
          quiz_id: string
        }
        Update: {
          academy_id?: string
          excluded_at?: string | null
          excluded_by?: string | null
          excluded_revision?: number | null
          id?: string
          max_score?: number
          model_answer?: string
          part_id?: string
          position?: number
          prompt?: string
          quiz_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_academy_id_quiz_id_fkey"
            columns: ["academy_id", "quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "quiz_questions_excluded_by_fkey"
            columns: ["excluded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_quiz_id_part_id_fkey"
            columns: ["quiz_id", "part_id"]
            isOneToOne: false
            referencedRelation: "quiz_parts"
            referencedColumns: ["quiz_id", "id"]
          },
        ]
      }
      quiz_requests: {
        Row: {
          academy_id: string
          actor_id: string
          created_at: string
          fingerprint: string
          idempotency_key: string
          operation: string
          quiz_id: string
          response: Json
        }
        Insert: {
          academy_id: string
          actor_id: string
          created_at?: string
          fingerprint: string
          idempotency_key: string
          operation: string
          quiz_id: string
          response: Json
        }
        Update: {
          academy_id?: string
          actor_id?: string
          created_at?: string
          fingerprint?: string
          idempotency_key?: string
          operation?: string
          quiz_id?: string
          response?: Json
        }
        Relationships: [
          {
            foreignKeyName: "quiz_requests_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_result_effects: {
        Row: {
          academy_id: string
          annual_student_record_id: string
          created_at: string
          effect_type: Database["public"]["Enums"]["quiz_effect_type"]
          id: string
          processed_at: string | null
          publication_id: string | null
          quiz_id: string
        }
        Insert: {
          academy_id: string
          annual_student_record_id: string
          created_at?: string
          effect_type: Database["public"]["Enums"]["quiz_effect_type"]
          id?: string
          processed_at?: string | null
          publication_id?: string | null
          quiz_id: string
        }
        Update: {
          academy_id?: string
          annual_student_record_id?: string
          created_at?: string
          effect_type?: Database["public"]["Enums"]["quiz_effect_type"]
          id?: string
          processed_at?: string | null
          publication_id?: string | null
          quiz_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_result_effects_academy_id_publication_id_fkey"
            columns: ["academy_id", "publication_id"]
            isOneToOne: false
            referencedRelation: "quiz_result_publications"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "quiz_result_effects_quiz_id_annual_student_record_id_fkey"
            columns: ["quiz_id", "annual_student_record_id"]
            isOneToOne: false
            referencedRelation: "quiz_work"
            referencedColumns: ["quiz_id", "annual_student_record_id"]
          },
        ]
      }
      quiz_result_publications: {
        Row: {
          academic_year_id: string
          academy_id: string
          annual_student_record_id: string
          automatic: boolean
          content_hash: string
          feedback: string
          id: string
          items: Json
          max_score: number
          previous_publication_id: string | null
          published_at: string
          published_by: string | null
          quiz_id: string
          revision: number
          scoring_revision: number
          total: number
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          annual_student_record_id: string
          automatic: boolean
          content_hash: string
          feedback: string
          id?: string
          items: Json
          max_score: number
          previous_publication_id?: string | null
          published_at?: string
          published_by?: string | null
          quiz_id: string
          revision: number
          scoring_revision: number
          total: number
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          annual_student_record_id?: string
          automatic?: boolean
          content_hash?: string
          feedback?: string
          id?: string
          items?: Json
          max_score?: number
          previous_publication_id?: string | null
          published_at?: string
          published_by?: string | null
          quiz_id?: string
          revision?: number
          scoring_revision?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_result_publications_academy_id_academic_year_id_quiz__fkey"
            columns: ["academy_id", "academic_year_id", "quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "quiz_result_publications_previous_publication_id_fkey"
            columns: ["previous_publication_id"]
            isOneToOne: false
            referencedRelation: "quiz_result_publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_result_publications_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_result_publications_quiz_id_annual_student_record_id_fkey"
            columns: ["quiz_id", "annual_student_record_id"]
            isOneToOne: false
            referencedRelation: "quiz_work"
            referencedColumns: ["quiz_id", "annual_student_record_id"]
          },
        ]
      }
      quiz_submission_answers: {
        Row: {
          academy_id: string
          choice_id: string | null
          question_id: string
          quiz_id: string
          submission_id: string
          text_answer: string | null
        }
        Insert: {
          academy_id: string
          choice_id?: string | null
          question_id: string
          quiz_id: string
          submission_id: string
          text_answer?: string | null
        }
        Update: {
          academy_id?: string
          choice_id?: string | null
          question_id?: string
          quiz_id?: string
          submission_id?: string
          text_answer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_submission_answers_question_id_choice_id_fkey"
            columns: ["question_id", "choice_id"]
            isOneToOne: false
            referencedRelation: "quiz_choices"
            referencedColumns: ["question_id", "id"]
          },
          {
            foreignKeyName: "quiz_submission_answers_quiz_id_question_id_fkey"
            columns: ["quiz_id", "question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["quiz_id", "id"]
          },
          {
            foreignKeyName: "quiz_submission_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "quiz_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_submissions: {
        Row: {
          academic_year_id: string
          academy_id: string
          annual_student_record_id: string
          attempt_id: string | null
          confirmed_by: string | null
          id: string
          original_deadline_at: string | null
          processed_at: string
          quiz_id: string
          reason: Database["public"]["Enums"]["quiz_finalization_reason"]
          scoring_revision: number
          source: Database["public"]["Enums"]["quiz_source"]
          submitted_at: string
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          annual_student_record_id: string
          attempt_id?: string | null
          confirmed_by?: string | null
          id?: string
          original_deadline_at?: string | null
          processed_at: string
          quiz_id: string
          reason: Database["public"]["Enums"]["quiz_finalization_reason"]
          scoring_revision: number
          source: Database["public"]["Enums"]["quiz_source"]
          submitted_at: string
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          annual_student_record_id?: string
          attempt_id?: string | null
          confirmed_by?: string | null
          id?: string
          original_deadline_at?: string | null
          processed_at?: string
          quiz_id?: string
          reason?: Database["public"]["Enums"]["quiz_finalization_reason"]
          scoring_revision?: number
          source?: Database["public"]["Enums"]["quiz_source"]
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_submissions_academy_id_academic_year_id_quiz_id_fkey"
            columns: ["academy_id", "academic_year_id", "quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "quiz_submissions_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_submissions_quiz_id_annual_student_record_id_fkey"
            columns: ["quiz_id", "annual_student_record_id"]
            isOneToOne: true
            referencedRelation: "quiz_work"
            referencedColumns: ["quiz_id", "annual_student_record_id"]
          },
          {
            foreignKeyName: "quiz_submissions_quiz_id_attempt_id_fkey"
            columns: ["quiz_id", "attempt_id"]
            isOneToOne: false
            referencedRelation: "quiz_attempts"
            referencedColumns: ["quiz_id", "id"]
          },
        ]
      }
      quiz_work: {
        Row: {
          academic_year_id: string
          academy_id: string
          accepted_source: Database["public"]["Enums"]["quiz_source"] | null
          accepted_submission_id: string | null
          annual_student_record_id: string
          created_at: string
          feedback: string
          published_revision: number
          quiz_id: string
          solutions_qualified_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          accepted_source?: Database["public"]["Enums"]["quiz_source"] | null
          accepted_submission_id?: string | null
          annual_student_record_id: string
          created_at?: string
          feedback?: string
          published_revision?: number
          quiz_id: string
          solutions_qualified_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          accepted_source?: Database["public"]["Enums"]["quiz_source"] | null
          accepted_submission_id?: string | null
          annual_student_record_id?: string
          created_at?: string
          feedback?: string
          published_revision?: number
          quiz_id?: string
          solutions_qualified_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_work_academy_id_academic_year_id_annual_student_recor_fkey"
            columns: [
              "academy_id",
              "academic_year_id",
              "annual_student_record_id",
            ]
            isOneToOne: false
            referencedRelation: "annual_student_records"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "quiz_work_academy_id_academic_year_id_quiz_id_fkey"
            columns: ["academy_id", "academic_year_id", "quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "quiz_work_submission_fk"
            columns: ["quiz_id", "accepted_submission_id"]
            isOneToOne: false
            referencedRelation: "quiz_submissions"
            referencedColumns: ["quiz_id", "id"]
          },
        ]
      }
      quizzes: {
        Row: {
          academic_year_id: string
          academy_id: string
          actual_closes_at: string | null
          archived_at: string | null
          archived_by: string | null
          audience: Database["public"]["Enums"]["quiz_audience"] | null
          availability_updated_at: string | null
          availability_updated_by: string | null
          closes_at: string | null
          created_at: string
          created_by: string
          id: string
          instructions: string
          level_id: string | null
          max_score: number
          offering_closed_at: string | null
          opens_at: string | null
          question_count: number
          scoring_revision: number
          solution_notes: string
          structure_locked_at: string | null
          time_limit_minutes: number | null
          title: string
          track_id: string | null
          updated_at: string
          updated_by: string
          version: number
          work_started_at: string | null
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          actual_closes_at?: string | null
          archived_at?: string | null
          archived_by?: string | null
          audience?: Database["public"]["Enums"]["quiz_audience"] | null
          availability_updated_at?: string | null
          availability_updated_by?: string | null
          closes_at?: string | null
          created_at?: string
          created_by: string
          id: string
          instructions?: string
          level_id?: string | null
          max_score?: number
          offering_closed_at?: string | null
          opens_at?: string | null
          question_count?: number
          scoring_revision?: number
          solution_notes?: string
          structure_locked_at?: string | null
          time_limit_minutes?: number | null
          title: string
          track_id?: string | null
          updated_at?: string
          updated_by: string
          version?: number
          work_started_at?: string | null
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          actual_closes_at?: string | null
          archived_at?: string | null
          archived_by?: string | null
          audience?: Database["public"]["Enums"]["quiz_audience"] | null
          availability_updated_at?: string | null
          availability_updated_by?: string | null
          closes_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          instructions?: string
          level_id?: string | null
          max_score?: number
          offering_closed_at?: string | null
          opens_at?: string | null
          question_count?: number
          scoring_revision?: number
          solution_notes?: string
          structure_locked_at?: string | null
          time_limit_minutes?: number | null
          title?: string
          track_id?: string | null
          updated_at?: string
          updated_by?: string
          version?: number
          work_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_academy_id_academic_year_id_fkey"
            columns: ["academy_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "quizzes_academy_id_level_id_fkey"
            columns: ["academy_id", "level_id"]
            isOneToOne: false
            referencedRelation: "academy_levels"
            referencedColumns: ["academy_id", "level_id"]
          },
          {
            foreignKeyName: "quizzes_academy_id_level_id_track_id_fkey"
            columns: ["academy_id", "level_id", "track_id"]
            isOneToOne: false
            referencedRelation: "academy_tracks"
            referencedColumns: ["academy_id", "level_id", "id"]
          },
          {
            foreignKeyName: "quizzes_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_availability_updated_by_fkey"
            columns: ["availability_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          original_track_name: string | null
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
          original_track_name?: string | null
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
          original_track_name?: string | null
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
      session_archive_events: {
        Row: {
          academic_year_id: string
          academy_id: string
          action: string
          actor_id: string
          actor_name: string | null
          ended_live: boolean
          id: number
          metadata_version: number
          note: string | null
          occurred_at: string
          session_id: string
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          action: string
          actor_id: string
          actor_name?: string | null
          ended_live?: boolean
          id?: never
          metadata_version: number
          note?: string | null
          occurred_at?: string
          session_id: string
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          action?: string
          actor_id?: string
          actor_name?: string | null
          ended_live?: boolean
          id?: never
          metadata_version?: number
          note?: string | null
          occurred_at?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_archive_events_academy_id_academic_year_id_session_fkey"
            columns: ["academy_id", "academic_year_id", "session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "session_archive_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_archive_requests: {
        Row: {
          academy_id: string
          actor_id: string
          created_at: string
          fingerprint: string
          idempotency_key: string
          response: Json
          session_id: string
        }
        Insert: {
          academy_id: string
          actor_id: string
          created_at?: string
          fingerprint: string
          idempotency_key: string
          response: Json
          session_id: string
        }
        Update: {
          academy_id?: string
          actor_id?: string
          created_at?: string
          fingerprint?: string
          idempotency_key?: string
          response?: Json
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_archive_requests_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_archive_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_content_items: {
        Row: {
          academic_year_id: string
          academy_id: string
          content_revision: number
          position: number
          revision: number
          session_id: string
          title: string
          unit_id: string
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          content_revision: number
          position: number
          revision: number
          session_id: string
          title: string
          unit_id: string
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          content_revision?: number
          position?: number
          revision?: number
          session_id?: string
          title?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_content_items_academy_id_academic_year_id_session__fkey"
            columns: [
              "academy_id",
              "academic_year_id",
              "session_id",
              "revision",
            ]
            isOneToOne: false
            referencedRelation: "session_content_sets"
            referencedColumns: [
              "academy_id",
              "academic_year_id",
              "session_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "session_content_items_academy_id_unit_id_fkey"
            columns: ["academy_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "content_units"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "session_content_items_unit_id_content_revision_fkey"
            columns: ["unit_id", "content_revision"]
            isOneToOne: false
            referencedRelation: "content_revisions"
            referencedColumns: ["unit_id", "revision"]
          },
        ]
      }
      session_content_requests: {
        Row: {
          academy_id: string
          actor_id: string
          fingerprint: string
          request_key: string
          response: Json
          session_id: string
        }
        Insert: {
          academy_id: string
          actor_id: string
          fingerprint: string
          request_key: string
          response: Json
          session_id: string
        }
        Update: {
          academy_id?: string
          actor_id?: string
          fingerprint?: string
          request_key?: string
          response?: Json
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_content_requests_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_content_requests_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_content_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_content_sets: {
        Row: {
          academic_year_id: string
          academy_id: string
          revision: number
          saved_at: string
          saved_by: string
          saved_by_name: string | null
          session_id: string
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          revision: number
          saved_at?: string
          saved_by: string
          saved_by_name?: string | null
          session_id: string
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          revision?: number
          saved_at?: string
          saved_by?: string
          saved_by_name?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_content_sets_academy_id_academic_year_id_session_i_fkey"
            columns: ["academy_id", "academic_year_id", "session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "session_content_sets_saved_by_fkey"
            columns: ["saved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_roster_entries: {
        Row: {
          academic_year_id: string
          academy_id: string
          added_by: string | null
          added_by_name: string | null
          annual_student_record_id: string
          created_at: string
          level_id: string
          origin: Database["public"]["Enums"]["session_roster_origin"]
          participation_type: Database["public"]["Enums"]["student_participation_type"]
          primary_group_id: string | null
          session_id: string
          track_id: string | null
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          added_by?: string | null
          added_by_name?: string | null
          annual_student_record_id: string
          created_at?: string
          level_id: string
          origin: Database["public"]["Enums"]["session_roster_origin"]
          participation_type: Database["public"]["Enums"]["student_participation_type"]
          primary_group_id?: string | null
          session_id: string
          track_id?: string | null
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          added_by?: string | null
          added_by_name?: string | null
          annual_student_record_id?: string
          created_at?: string
          level_id?: string
          origin?: Database["public"]["Enums"]["session_roster_origin"]
          participation_type?: Database["public"]["Enums"]["student_participation_type"]
          primary_group_id?: string | null
          session_id?: string
          track_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_roster_entries_academy_id_academic_year_id_annual__fkey"
            columns: [
              "academy_id",
              "academic_year_id",
              "annual_student_record_id",
            ]
            isOneToOne: false
            referencedRelation: "annual_student_records"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "session_roster_entries_academy_id_academic_year_id_session_fkey"
            columns: ["academy_id", "academic_year_id", "session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "session_roster_entries_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_start_requests: {
        Row: {
          actor_id: string
          created_at: string
          session_id: string
          start_key: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          session_id: string
          start_key: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          session_id?: string
          start_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_start_requests_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_start_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          academic_year_id: string
          academy_id: string
          archive_note: string | null
          archived_at: string | null
          archived_by: string | null
          archived_by_name: string | null
          audience: Database["public"]["Enums"]["schedule_audience"]
          auto_end_at: string
          end_reason: Database["public"]["Enums"]["session_end_reason"] | null
          ended_at: string | null
          ended_by: string | null
          ended_by_name: string | null
          group_id: string | null
          group_name: string | null
          id: string
          level_id: string
          location: string | null
          mandatory: boolean
          metadata_version: number
          schedule_id: string
          schedule_kind: Database["public"]["Enums"]["schedule_kind"]
          schedule_title: string
          start_key: string
          started_at: string
          started_by: string
          started_by_name: string | null
          state: Database["public"]["Enums"]["session_state"]
          track_id: string | null
          track_name: string | null
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          archive_note?: string | null
          archived_at?: string | null
          archived_by?: string | null
          archived_by_name?: string | null
          audience: Database["public"]["Enums"]["schedule_audience"]
          auto_end_at: string
          end_reason?: Database["public"]["Enums"]["session_end_reason"] | null
          ended_at?: string | null
          ended_by?: string | null
          ended_by_name?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: string
          level_id: string
          location?: string | null
          mandatory: boolean
          metadata_version?: number
          schedule_id: string
          schedule_kind: Database["public"]["Enums"]["schedule_kind"]
          schedule_title: string
          start_key: string
          started_at?: string
          started_by: string
          started_by_name?: string | null
          state?: Database["public"]["Enums"]["session_state"]
          track_id?: string | null
          track_name?: string | null
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          archive_note?: string | null
          archived_at?: string | null
          archived_by?: string | null
          archived_by_name?: string | null
          audience?: Database["public"]["Enums"]["schedule_audience"]
          auto_end_at?: string
          end_reason?: Database["public"]["Enums"]["session_end_reason"] | null
          ended_at?: string | null
          ended_by?: string | null
          ended_by_name?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: string
          level_id?: string
          location?: string | null
          mandatory?: boolean
          metadata_version?: number
          schedule_id?: string
          schedule_kind?: Database["public"]["Enums"]["schedule_kind"]
          schedule_title?: string
          start_key?: string
          started_at?: string
          started_by?: string
          started_by_name?: string | null
          state?: Database["public"]["Enums"]["session_state"]
          track_id?: string | null
          track_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_academy_id_academic_year_id_fkey"
            columns: ["academy_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "sessions_academy_id_academic_year_id_schedule_id_fkey"
            columns: ["academy_id", "academic_year_id", "schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "sessions_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invitation_lookup_limits: {
        Row: {
          failures: number
          user_id: string
          window_started_at: string
        }
        Insert: {
          failures: number
          user_id: string
          window_started_at: string
        }
        Update: {
          failures?: number
          user_id?: string
          window_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invitation_lookup_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invitations: {
        Row: {
          academy_id: string
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          phone: string
          revoked_at: string | null
          revoked_by: string | null
          role: Database["public"]["Enums"]["academy_role"]
          status: Database["public"]["Enums"]["staff_invitation_status"]
          token_ciphertext: string
          token_hash: string
        }
        Insert: {
          academy_id: string
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          phone: string
          revoked_at?: string | null
          revoked_by?: string | null
          role: Database["public"]["Enums"]["academy_role"]
          status?: Database["public"]["Enums"]["staff_invitation_status"]
          token_ciphertext: string
          token_hash: string
        }
        Update: {
          academy_id?: string
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          phone?: string
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["academy_role"]
          status?: Database["public"]["Enums"]["staff_invitation_status"]
          token_ciphertext?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invitations_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invitations_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_code_assignments: {
        Row: {
          academic_year_id: string
          academy_id: string
          academy_student_profile_id: string
          annual_student_record_id: string
          code: string
          code_version: number
          id: string
          issued_at: string
          issued_by: string
          level_id: string
          retired_at: string | null
          retired_by: string | null
          retirement_reason:
            | Database["public"]["Enums"]["student_code_retirement_reason"]
            | null
        }
        Insert: {
          academic_year_id: string
          academy_id: string
          academy_student_profile_id: string
          annual_student_record_id: string
          code: string
          code_version: number
          id?: string
          issued_at?: string
          issued_by: string
          level_id: string
          retired_at?: string | null
          retired_by?: string | null
          retirement_reason?:
            | Database["public"]["Enums"]["student_code_retirement_reason"]
            | null
        }
        Update: {
          academic_year_id?: string
          academy_id?: string
          academy_student_profile_id?: string
          annual_student_record_id?: string
          code?: string
          code_version?: number
          id?: string
          issued_at?: string
          issued_by?: string
          level_id?: string
          retired_at?: string | null
          retired_by?: string | null
          retirement_reason?:
            | Database["public"]["Enums"]["student_code_retirement_reason"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "student_code_assignments_academy_id_academy_student_profil_fkey"
            columns: ["academy_id", "academy_student_profile_id"]
            isOneToOne: false
            referencedRelation: "academy_student_profiles"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "student_code_assignments_academy_id_level_id_fkey"
            columns: ["academy_id", "level_id"]
            isOneToOne: false
            referencedRelation: "academy_levels"
            referencedColumns: ["academy_id", "level_id"]
          },
          {
            foreignKeyName: "student_code_assignments_annual_student_record_id_academy__fkey"
            columns: [
              "annual_student_record_id",
              "academy_id",
              "academic_year_id",
              "academy_student_profile_id",
            ]
            isOneToOne: false
            referencedRelation: "annual_student_records"
            referencedColumns: [
              "id",
              "academy_id",
              "academic_year_id",
              "academy_student_profile_id",
            ]
          },
          {
            foreignKeyName: "student_code_assignments_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_code_assignments_retired_by_fkey"
            columns: ["retired_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_code_counters: {
        Row: {
          academy_id: string
          last_value: number
          prefix: string
          width: number
        }
        Insert: {
          academy_id: string
          last_value?: number
          prefix: string
          width: number
        }
        Update: {
          academy_id?: string
          last_value?: number
          prefix?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_code_counters_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
        ]
      }
      student_code_level_patterns: {
        Row: {
          academy_id: string
          level_id: string
          pattern: string
        }
        Insert: {
          academy_id: string
          level_id: string
          pattern: string
        }
        Update: {
          academy_id?: string
          level_id?: string
          pattern?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_code_level_patterns_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "student_code_settings"
            referencedColumns: ["academy_id"]
          },
          {
            foreignKeyName: "student_code_level_patterns_academy_id_level_id_fkey"
            columns: ["academy_id", "level_id"]
            isOneToOne: true
            referencedRelation: "academy_levels"
            referencedColumns: ["academy_id", "level_id"]
          },
        ]
      }
      student_code_requests: {
        Row: {
          academy_id: string
          actor_id: string
          created_at: string
          fingerprint: string
          request_key: string
          result: Json
        }
        Insert: {
          academy_id: string
          actor_id: string
          created_at?: string
          fingerprint: string
          request_key: string
          result: Json
        }
        Update: {
          academy_id?: string
          actor_id?: string
          created_at?: string
          fingerprint?: string
          request_key?: string
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "student_code_requests_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_code_requests_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_code_reservations: {
        Row: {
          academy_id: string
          code: string
          reserved_at: string
        }
        Insert: {
          academy_id: string
          code: string
          reserved_at?: string
        }
        Update: {
          academy_id?: string
          code?: string
          reserved_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_code_reservations_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
        ]
      }
      student_code_settings: {
        Row: {
          academy_id: string
          default_pattern: string | null
          enabled: boolean
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          academy_id: string
          default_pattern?: string | null
          enabled?: boolean
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          academy_id?: string
          default_pattern?: string | null
          enabled?: boolean
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_code_settings_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: true
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_code_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_code_states: {
        Row: {
          academy_id: string
          annual_student_record_id: string
          current_assignment_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          academy_id: string
          annual_student_record_id: string
          current_assignment_id?: string | null
          updated_at?: string
          version: number
        }
        Update: {
          academy_id?: string
          annual_student_record_id?: string
          current_assignment_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_code_states_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_code_states_annual_student_record_id_fkey"
            columns: ["annual_student_record_id"]
            isOneToOne: true
            referencedRelation: "annual_student_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_code_states_current_assignment_id_annual_student_r_fkey"
            columns: ["current_assignment_id", "annual_student_record_id"]
            isOneToOne: false
            referencedRelation: "student_code_assignments"
            referencedColumns: ["id", "annual_student_record_id"]
          },
        ]
      }
      student_enrollment_settings: {
        Row: {
          academy_id: string
          enrollment_open: boolean
          invite_token: string | null
          new_student_participation_type: Database["public"]["Enums"]["student_participation_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          academy_id: string
          enrollment_open?: boolean
          invite_token?: string | null
          new_student_participation_type?: Database["public"]["Enums"]["student_participation_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          academy_id?: string
          enrollment_open?: boolean
          invite_token?: string | null
          new_student_participation_type?: Database["public"]["Enums"]["student_participation_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_enrollment_settings_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: true
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_enrollment_settings_updated_by_fkey"
            columns: ["updated_by"]
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
      counted_attendance: {
        Row: {
          academic_year_id: string | null
          academy_id: string | null
          annual_student_record_id: string | null
          mandatory: boolean | null
          origin: Database["public"]["Enums"]["session_roster_origin"] | null
          publication_id: string | null
          published_at: string | null
          schedule_id: string | null
          session_id: string | null
          session_started_at: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_academy_id_academic_year_id_annual_stud_fkey"
            columns: [
              "academy_id",
              "academic_year_id",
              "annual_student_record_id",
            ]
            isOneToOne: false
            referencedRelation: "annual_student_records"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "attendance_records_academy_id_academic_year_id_session_id_fkey"
            columns: ["academy_id", "academic_year_id", "session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["academy_id", "academic_year_id", "id"]
          },
          {
            foreignKeyName: "attendance_records_publication_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "attendance_publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_session_id_annual_student_record_id_fkey"
            columns: ["session_id", "annual_student_record_id"]
            isOneToOne: true
            referencedRelation: "session_roster_entries"
            referencedColumns: ["session_id", "annual_student_record_id"]
          },
        ]
      }
      session_taught_content: {
        Row: {
          academic_year_id: string | null
          academy_id: string | null
          content_revision: number | null
          position: number | null
          revision: number | null
          session_id: string | null
          title: string | null
          unit_id: string | null
        }
        Insert: {
          academic_year_id?: string | null
          academy_id?: string | null
          content_revision?: number | null
          position?: number | null
          revision?: number | null
          session_id?: string | null
          title?: string | null
          unit_id?: string | null
        }
        Update: {
          academic_year_id?: string | null
          academy_id?: string | null
          content_revision?: number | null
          position?: number | null
          revision?: number | null
          session_id?: string | null
          title?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_content_items_academy_id_academic_year_id_session__fkey"
            columns: [
              "academy_id",
              "academic_year_id",
              "session_id",
              "revision",
            ]
            isOneToOne: false
            referencedRelation: "session_content_sets"
            referencedColumns: [
              "academy_id",
              "academic_year_id",
              "session_id",
              "revision",
            ]
          },
          {
            foreignKeyName: "session_content_items_academy_id_unit_id_fkey"
            columns: ["academy_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "content_units"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "session_content_items_unit_id_content_revision_fkey"
            columns: ["unit_id", "content_revision"]
            isOneToOne: false
            referencedRelation: "content_revisions"
            referencedColumns: ["unit_id", "revision"]
          },
        ]
      }
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
      accept_staff_invitation: { Args: { p_token: string }; Returns: Json }
      add_session_attendee: {
        Args: {
          p_academy_id: string
          p_expected_revision: number
          p_key: string
          p_record_id: string
          p_session_id: string
        }
        Returns: Json
      }
      allocate_student_code: {
        Args: { p_academy_id: string; p_level_id: string }
        Returns: string
      }
      announce_exam_results: {
        Args: {
          p_academy_id: string
          p_exam_id: string
          p_expected_scoring_revision: number
          p_items: Json
          p_key: string
        }
        Returns: Json
      }
      announce_quiz_results: {
        Args: {
          p_academy_id: string
          p_expected_scoring_revision: number
          p_items: Json
          p_key: string
          p_quiz_id: string
        }
        Returns: Json
      }
      apply_attendance_changes: {
        Args: {
          p_academy_id: string
          p_changes: Json
          p_key: string
          p_operation: string
          p_session_id: string
        }
        Returns: Json
      }
      archive_exam: {
        Args: {
          p_academy_id: string
          p_exam_id: string
          p_expected_version: number
        }
        Returns: Json
      }
      archive_quiz: {
        Args: {
          p_academy_id: string
          p_expected_version: number
          p_quiz_id: string
        }
        Returns: Json
      }
      archive_session: {
        Args: {
          p_academy_id: string
          p_expected_version: number
          p_key: string
          p_note?: string
          p_session_id: string
        }
        Returns: Json
      }
      assignment_file_cleanup: {
        Args: {
          p_academy_id: string
          p_assignment_id: string
          p_completed?: string[]
        }
        Returns: Json
      }
      assignment_online_setting: {
        Args: { p_academy_id: string; p_enabled?: boolean; p_version?: number }
        Returns: Json
      }
      assignment_student_command: { Args: { p_input: Json }; Returns: Json }
      attendance_entry: {
        Args: { p_record_id: string; p_session_id: string }
        Returns: Json
      }
      attendance_pending: { Args: { p_session_id: string }; Returns: boolean }
      attendance_replay: {
        Args: { p_fingerprint: string; p_key: string; p_operation: string }
        Returns: Json
      }
      attest_assignment_upload: {
        Args: {
          p_file_id: string
          p_mime: string
          p_sha256: string
          p_size: number
        }
        Returns: undefined
      }
      authorize_assignment_received_file: {
        Args: { p_academy_id: string; p_file_id: string }
        Returns: Json
      }
      authorize_content_material: {
        Args: { p_academy_id: string; p_item_id: string; p_unit_id: string }
        Returns: Json
      }
      authorize_content_material_before_assignments: {
        Args: { p_academy_id: string; p_item_id: string; p_unit_id: string }
        Returns: Json
      }
      authorize_my_assignment_images: {
        Args: { p_ids: string[]; p_input: Json }
        Returns: string[]
      }
      authorize_my_exam_images: {
        Args: {
          p_academy_id: string
          p_exam_id: string
          p_image_ids: string[]
          p_token: string
        }
        Returns: Json
      }
      authorize_my_exam_review_images: {
        Args: { p_academy_id: string; p_exam_id: string; p_image_ids: string[] }
        Returns: Json
      }
      bump_attendance_revision: {
        Args: { p_session: Database["public"]["Tables"]["sessions"]["Row"] }
        Returns: number
      }
      can_join_attendance_channel: {
        Args: { p_topic: string }
        Returns: boolean
      }
      can_read_avatar_object: { Args: { p_name: string }; Returns: boolean }
      cancel_account_password_challenge: {
        Args: { p_challenge_id: string; p_user_id: string }
        Returns: undefined
      }
      cancel_contact_change: {
        Args: { p_operation_id: string; p_user_id: string }
        Returns: string
      }
      cancel_student_import: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      change_assignment_answer_access: {
        Args: {
          p_academy_id: string
          p_action: string
          p_assignment_id: string
          p_reason: string
          p_record_id: string
          p_request_id: string
        }
        Returns: Json
      }
      change_assignment_state: {
        Args: {
          p_academy_id: string
          p_action: string
          p_assignment_id: string
          p_expected_version: number
        }
        Returns: Json
      }
      change_content_unit: {
        Args: {
          p_academy_id: string
          p_action: string
          p_feedback?: string
          p_unit_id: string
          p_version: number
        }
        Returns: number
      }
      change_staff_member_role: {
        Args: {
          p_academy_id: string
          p_role: Database["public"]["Enums"]["academy_role"]
          p_user_id: string
        }
        Returns: Json
      }
      change_student_code: {
        Args: {
          p_academy_id: string
          p_action: string
          p_code: string
          p_expected_version: number
          p_record_id: string
          p_request_key: string
        }
        Returns: Json
      }
      check_in_attendance: {
        Args: {
          p_academy_id: string
          p_annual_record_id: string
          p_key: string
          p_session_id: string
        }
        Returns: Json
      }
      check_in_attendance_by_code: {
        Args: {
          p_academy_id: string
          p_code: string
          p_key: string
          p_late_after_minutes?: number
          p_session_id: string
        }
        Returns: Json
      }
      check_in_attendance_with_late: {
        Args: {
          p_academy_id: string
          p_annual_record_id: string
          p_key: string
          p_late_after_minutes: number
          p_session_id: string
        }
        Returns: Json
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
      claim_account_password_change: {
        Args: {
          p_challenge_id: string
          p_session_id: string
          p_user_id: string
        }
        Returns: string
      }
      claim_login_phone_change: {
        Args: {
          p_operation_id: string
          p_session_id: string
          p_user_id: string
        }
        Returns: Json
      }
      claim_my_exam_editor: {
        Args: { p_academy_id: string; p_exam_id: string; p_token: string }
        Returns: Json
      }
      complete_content_document: {
        Args: { p_academy_id: string; p_asset_id: string }
        Returns: undefined
      }
      complete_content_video_deletion: {
        Args: { p_academy_id: string; p_asset_id: string; p_token: string }
        Returns: undefined
      }
      complete_student_invite: {
        Args: { p_group_id: string; p_token: string; p_track_id: string }
        Returns: Json
      }
      configure_exam_availability: {
        Args: {
          p_academy_id: string
          p_closes_at: string
          p_exam_id: string
          p_expected_version: number
          p_opens_at: string
        }
        Returns: Json
      }
      configure_quiz_availability: {
        Args: {
          p_academy_id: string
          p_closes_at: string
          p_expected_version: number
          p_opens_at: string
          p_quiz_id: string
        }
        Returns: Json
      }
      confirm_content_access: {
        Args: {
          p_academy_id: string
          p_expected_grant_id: string
          p_expected_revision: number
          p_extension_hours?: number
          p_record_id: string
          p_request_id: string
          p_unit_id: string
        }
        Returns: Json
      }
      confirm_exam_physical: {
        Args: {
          p_academy_id: string
          p_exam_id: string
          p_expected_version: number
          p_key: string
          p_record_id: string
        }
        Returns: Json
      }
      confirm_quiz_physical: {
        Args: {
          p_academy_id: string
          p_expected_version: number
          p_key: string
          p_quiz_id: string
          p_record_id: string
        }
        Returns: Json
      }
      confirm_student_import: {
        Args: { p_expected_revision: number; p_session_id: string }
        Returns: Json
      }
      consume_api_quota: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: Json
      }
      content_assessment_options: {
        Args: {
          p_academy_id: string
          p_limit?: number
          p_offset?: number
          p_unit_id: string
        }
        Returns: {
          id: string
          kind: string
          title: string
        }[]
      }
      copy_content_material: {
        Args: {
          p_academy_id: string
          p_item_id: string
          p_source_id: string
          p_target_id: string
          p_version: number
        }
        Returns: number
      }
      copy_content_unit: {
        Args: {
          p_academy_id: string
          p_level_id: string
          p_source_id: string
          p_track_id: string
          p_unit_id: string
          p_year_id: string
        }
        Returns: string
      }
      correct_assignment_key: {
        Args: {
          p_academy_id: string
          p_assignment_id: string
          p_choice_id: string
          p_expected_scoring_revision: number
          p_key: string
          p_question_id: string
        }
        Returns: Json
      }
      correct_exam_key: {
        Args: {
          p_academy_id: string
          p_choice_id: string
          p_exam_id: string
          p_expected_scoring_revision: number
          p_key: string
          p_question_id: string
        }
        Returns: Json
      }
      correct_quiz_key: {
        Args: {
          p_academy_id: string
          p_choice_id: string
          p_expected_scoring_revision: number
          p_key: string
          p_question_id: string
          p_quiz_id: string
        }
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
      create_assignment: {
        Args: {
          p_academic_year_id: string
          p_academy_id: string
          p_assignment_id: string
          p_draft: Json
        }
        Returns: Json
      }
      create_content_assessment: {
        Args: {
          p_academy_id: string
          p_kind: string
          p_title: string
          p_unit_id: string
          p_version: number
        }
        Returns: string
      }
      create_content_coupon_type: {
        Args: {
          p_academy_id: string
          p_name: string
          p_program_id: string
          p_request_id: string
        }
        Returns: Json
      }
      create_content_unit: {
        Args: {
          p_academy_id: string
          p_level_id: string
          p_title: string
          p_track_id: string
          p_unit_id: string
          p_year_id: string
        }
        Returns: string
      }
      create_exam: {
        Args: {
          p_academic_year_id: string
          p_academy_id: string
          p_draft: Json
          p_exam_id: string
        }
        Returns: Json
      }
      create_quiz: {
        Args: {
          p_academic_year_id: string
          p_academy_id: string
          p_draft: Json
          p_quiz_id: string
        }
        Returns: Json
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
      create_staff_invitation: {
        Args: {
          p_academy_id: string
          p_phone: string
          p_role: Database["public"]["Enums"]["academy_role"]
          p_token: string
          p_token_ciphertext: string
        }
        Returns: Json
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
      current_attendance_revision: {
        Args: { p_session_id: string }
        Returns: number
      }
      delete_session: {
        Args: { p_academy_id: string; p_session_id: string }
        Returns: undefined
      }
      dev_account: {
        Args: { p_logical_id: string; p_run_id: string }
        Returns: Json
      }
      dev_command_begin: {
        Args: {
          p_command_id: string
          p_control_id: string
          p_expected_revision: number
          p_kind: string
          p_previous_session_id: string
          p_target_logical_id: string
        }
        Returns: Json
      }
      dev_command_complete: {
        Args: {
          p_command_id: string
          p_control_id: string
          p_original_tokens: string
          p_prior_logical_id: string
          p_prior_return_path: string
          p_receipt: string
          p_session_id: string
          p_set_prior: boolean
          p_user_id: string
        }
        Returns: string
      }
      dev_control_end: {
        Args: { p_control_id: string; p_reason: string }
        Returns: string
      }
      dev_control_open: {
        Args: {
          p_control_id: string
          p_developer_id: string
          p_original_session_id: string
          p_original_tokens: string
          p_return_path: string
          p_run_id: string
          p_token_hash: string
        }
        Returns: string
      }
      dev_control_original: { Args: { p_control_id: string }; Returns: string }
      dev_control_sessions: {
        Args: { p_control_id: string; p_keep: string[] }
        Returns: Json
      }
      dev_control_state: { Args: { p_token_hash: string }; Returns: Json }
      dev_delivery_blocked: {
        Args: { p_phone: string; p_user_id: string }
        Returns: boolean
      }
      dev_preview_context: { Args: { p_developer_id: string }; Returns: Json }
      dev_run_targets: { Args: { p_run_id: string }; Returns: Json }
      dev_session_revoked: {
        Args: { p_control_id: string; p_session_id: string }
        Returns: undefined
      }
      end_session: {
        Args: { p_academy_id: string; p_session_id: string }
        Returns: string
      }
      enter_my_exam: {
        Args: { p_academy_id: string; p_exam_id: string; p_token: string }
        Returns: Json
      }
      exclude_assignment_question: {
        Args: {
          p_academy_id: string
          p_assignment_id: string
          p_expected_scoring_revision: number
          p_key: string
          p_question_id: string
        }
        Returns: Json
      }
      exclude_exam_question: {
        Args: {
          p_academy_id: string
          p_exam_id: string
          p_expected_scoring_revision: number
          p_key: string
          p_question_id: string
        }
        Returns: Json
      }
      exclude_quiz_question: {
        Args: {
          p_academy_id: string
          p_expected_scoring_revision: number
          p_key: string
          p_question_id: string
          p_quiz_id: string
        }
        Returns: Json
      }
      expire_sessions: { Args: { p_schedule_id: string }; Returns: undefined }
      extend_my_content_access: {
        Args: { p_academy_id: string; p_request_id: string; p_unit_id: string }
        Returns: Json
      }
      finalize_student_import: {
        Args: { p_session_id: string }
        Returns: number
      }
      finish_account_password_change: {
        Args: { p_challenge_id: string; p_changed: boolean; p_user_id: string }
        Returns: undefined
      }
      finish_student_profile: {
        Args: { p_level_id: string; p_user_id: string }
        Returns: boolean
      }
      force_delete_session: {
        Args: { p_academy_id: string; p_session_id: string }
        Returns: undefined
      }
      generate_content_coupons: {
        Args: {
          p_academy_id: string
          p_quantity: number
          p_request_id: string
          p_type_id: string
        }
        Returns: Json
      }
      generate_student_codes: {
        Args: {
          p_academy_id: string
          p_expected_version: number
          p_ids: string[]
          p_mode: string
          p_parity?: string
          p_preview_token: string
          p_request_key: string
          p_start?: number
          p_step?: number
        }
        Returns: Json
      }
      get_academy_structure: { Args: { p_academy_id: string }; Returns: Json }
      get_assignment: {
        Args: { p_academy_id: string; p_assignment_id: string }
        Returns: Json
      }
      get_assignment_answer_access: {
        Args: {
          p_academy_id: string
          p_assignment_id: string
          p_record_id: string
        }
        Returns: Json
      }
      get_attendance: {
        Args: { p_academy_id: string; p_session_id: string }
        Returns: Json
      }
      get_content_access_history: {
        Args: { p_academy_id: string; p_record_id: string; p_unit_id: string }
        Returns: Json
      }
      get_content_access_workspace: {
        Args: {
          p_academy_id: string
          p_record_offset?: number
          p_search?: string
          p_unit_id: string
        }
        Returns: Json
      }
      get_content_coupon_options: {
        Args: { p_academy_id: string }
        Returns: Json
      }
      get_content_coupons: {
        Args: {
          p_academy_id: string
          p_offset?: number
          p_program_id?: string
          p_search?: string
          p_status?: string
          p_type_id?: string
        }
        Returns: Json
      }
      get_content_requirement_options: {
        Args: { p_academy_id: string; p_unit_id: string }
        Returns: Json
      }
      get_exam: {
        Args: { p_academy_id: string; p_exam_id: string }
        Returns: Json
      }
      get_exam_student: {
        Args: { p_academy_id: string; p_exam_id: string; p_record_id: string }
        Returns: Json
      }
      get_my_assignment: {
        Args: { p_academy_id: string; p_assignment_id: string }
        Returns: Json
      }
      get_my_content_unit: {
        Args: { p_academy_id: string; p_unit_id: string }
        Returns: Json
      }
      get_my_content_unit_before_assignments: {
        Args: { p_academy_id: string; p_unit_id: string }
        Returns: Json
      }
      get_my_content_unit_before_requirements: {
        Args: { p_academy_id: string; p_unit_id: string }
        Returns: Json
      }
      get_my_exam: { Args: { p_exam_id: string }; Returns: Json }
      get_my_exam_answering: {
        Args: { p_academy_id: string; p_exam_id: string; p_token: string }
        Returns: Json
      }
      get_my_exam_overview: {
        Args: { p_academy_id: string; p_exam_id: string }
        Returns: Json
      }
      get_my_exam_review: {
        Args: { p_academy_id: string; p_exam_id: string }
        Returns: Json
      }
      get_my_quiz: { Args: { p_quiz_id: string }; Returns: Json }
      get_my_student_academy: { Args: { p_slug: string }; Returns: Json }
      get_offering_track_labels: {
        Args: { p_academy_id: string }
        Returns: {
          academic_year_id: string
          name: string
          track_id: string
        }[]
      }
      get_quiz: {
        Args: { p_academy_id: string; p_quiz_id: string }
        Returns: Json
      }
      get_quiz_student: {
        Args: { p_academy_id: string; p_quiz_id: string; p_record_id: string }
        Returns: Json
      }
      get_session: {
        Args: { p_academy_id: string; p_session_id: string }
        Returns: Json
      }
      get_session_content: {
        Args: { p_academy_id: string; p_session_id: string }
        Returns: Json
      }
      get_student_code_settings: {
        Args: { p_academy_id: string }
        Returns: Json
      }
      get_student_code_state: {
        Args: { p_academy_id: string; p_record_id: string }
        Returns: Json
      }
      get_student_codes: {
        Args: { p_academy_id: string; p_record_ids: string[] }
        Returns: Json
      }
      get_student_enrollment_settings: {
        Args: { p_academy_id: string }
        Returns: Json
      }
      is_academy_manager: {
        Args: { target_academy_id: string }
        Returns: boolean
      }
      is_academy_member: {
        Args: { target_academy_id: string }
        Returns: boolean
      }
      is_assignment_image_staff: { Args: { p_name: string }; Returns: boolean }
      is_staff_account: { Args: never; Returns: boolean }
      issue_content_access: {
        Args: {
          p_academy_id: string
          p_extension_hours?: number
          p_record_id: string
          p_request_id: string
          p_unit_id: string
        }
        Returns: Json
      }
      list_assignment_marks: {
        Args: {
          p_academy_id: string
          p_assignment_id: string
          p_filter?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
        }
        Returns: Json
      }
      list_assignment_received_files: {
        Args: {
          p_academy_id: string
          p_assignment_id: string
          p_record_id: string
        }
        Returns: Json
      }
      list_assignment_recipients: {
        Args: { p_academy_id: string; p_assignment_id: string }
        Returns: Json
      }
      list_exam_students: {
        Args: { p_academy_id: string; p_exam_id: string }
        Returns: Json
      }
      list_exams: {
        Args: {
          p_academic_year_id: string
          p_academy_id: string
          p_audience: Database["public"]["Enums"]["exam_audience"]
          p_include_archived: boolean
          p_limit: number
          p_offset: number
          p_phase: string
          p_search: string
        }
        Returns: Json
      }
      list_live_sessions: {
        Args: {
          p_academy_id: string
          p_before_id: string
          p_before_started_at: string
          p_limit: number
        }
        Returns: Json
      }
      list_my_assignments: {
        Args: { p_academy_id: string; p_offset?: number; p_search?: string }
        Returns: Json
      }
      list_my_content_units: {
        Args: {
          p_academy_id: string
          p_limit?: number
          p_offset?: number
          p_search?: string
        }
        Returns: Json
      }
      list_my_exams: {
        Args: { p_academy_id: string; p_limit?: number; p_offset?: number }
        Returns: Json
      }
      list_my_student_academies: { Args: never; Returns: Json }
      list_past_sessions: {
        Args: {
          p_academy_id: string
          p_archive?: string
          p_before_id: string
          p_before_started_at: string
          p_from: string
          p_limit: number
          p_search: string
          p_to: string
        }
        Returns: Json
      }
      list_quiz_students: {
        Args: { p_academy_id: string; p_quiz_id: string }
        Returns: Json
      }
      list_quizzes: {
        Args: {
          p_academic_year_id: string
          p_academy_id: string
          p_audience: Database["public"]["Enums"]["quiz_audience"]
          p_include_archived: boolean
          p_limit: number
          p_offset: number
          p_phase: string
          p_search: string
        }
        Returns: Json
      }
      list_retired_student_codes: {
        Args: {
          p_academy_id: string
          p_limit: number
          p_offset: number
          p_search: string
        }
        Returns: Json
      }
      list_staff_invitations: {
        Args: {
          p_academy_id: string
          p_page_index: number
          p_page_size: number
          p_status: string
        }
        Returns: Json
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
      lock_attendance_session: {
        Args: { p_academy_id: string; p_session_id: string }
        Returns: {
          academic_year_id: string
          academy_id: string
          archive_note: string | null
          archived_at: string | null
          archived_by: string | null
          archived_by_name: string | null
          audience: Database["public"]["Enums"]["schedule_audience"]
          auto_end_at: string
          end_reason: Database["public"]["Enums"]["session_end_reason"] | null
          ended_at: string | null
          ended_by: string | null
          ended_by_name: string | null
          group_id: string | null
          group_name: string | null
          id: string
          level_id: string
          location: string | null
          mandatory: boolean
          metadata_version: number
          schedule_id: string
          schedule_kind: Database["public"]["Enums"]["schedule_kind"]
          schedule_title: string
          start_key: string
          started_at: string
          started_by: string
          started_by_name: string | null
          state: Database["public"]["Enums"]["session_state"]
          track_id: string | null
          track_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
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
      maintain_academy_offering: {
        Args: {
          p_academy_id: string
          p_change: Json
          p_expected_revision: number
          p_fingerprint: string
          p_request_key: string
        }
        Returns: Json
      }
      mark_unrecorded_absent: {
        Args: {
          p_academy_id: string
          p_expected_revision: number
          p_key: string
          p_session_id: string
        }
        Returns: Json
      }
      normalize_egyptian_phone: { Args: { value: string }; Returns: string }
      normalize_import_label: { Args: { value: string }; Returns: string }
      normalize_student_code: { Args: { value: string }; Returns: string }
      normalize_student_code_pattern: {
        Args: { value: string }
        Returns: string
      }
      normalize_student_code_text: {
        Args: { allow_hash: boolean; value: string }
        Returns: string
      }
      note_staff_invitation_lookup_failure: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      offering_startable_schedules: {
        Args: { p_academy_id: string }
        Returns: {
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
          original_track_name: string | null
          title: string
          track_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "schedules"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      own_suspended_staff_academies: {
        Args: never
        Returns: {
          icon: string
          id: string
          name: string
          slug: string
        }[]
      }
      owns_avatar_object: { Args: { p_name: string }; Returns: boolean }
      peek_next_student_code: {
        Args: { p_academy_id: string; p_record_id: string }
        Returns: string
      }
      preview_assignment_audience: {
        Args: {
          p_academic_year_id: string
          p_academy_id: string
          p_audience: Database["public"]["Enums"]["assignment_audience"]
          p_group_ids: string[]
          p_level_id: string
          p_track_id: string
        }
        Returns: Json
      }
      preview_exam_audience: {
        Args: {
          p_academic_year_id: string
          p_academy_id: string
          p_audience: Database["public"]["Enums"]["exam_audience"]
          p_group_ids: string[]
          p_level_id: string
          p_track_id: string
        }
        Returns: Json
      }
      preview_offering_change: {
        Args: { p_academy_id: string; p_change: Json }
        Returns: Json
      }
      preview_quiz_audience: {
        Args: {
          p_academic_year_id: string
          p_academy_id: string
          p_audience: Database["public"]["Enums"]["quiz_audience"]
          p_group_ids: string[]
          p_level_id: string
          p_track_id: string
        }
        Returns: Json
      }
      preview_staff_invitation: { Args: { p_token: string }; Returns: Json }
      preview_student_code_generation: {
        Args: {
          p_academy_id: string
          p_ids: string[]
          p_mode: string
          p_parity?: string
          p_start?: number
          p_step?: number
        }
        Returns: Json
      }
      preview_student_invite: { Args: { p_token: string }; Returns: Json }
      process_student_import_batch: {
        Args: { p_batch_index: number; p_session_id: string }
        Returns: Json
      }
      publish_assignment_results: {
        Args: {
          p_academy_id: string
          p_assignment_id: string
          p_items: Json
          p_key: string
        }
        Returns: Json
      }
      publish_attendance: {
        Args: {
          p_academy_id: string
          p_expected_revision: number
          p_key: string
          p_session_id: string
        }
        Returns: Json
      }
      record_assignment_work: {
        Args: {
          p_academy_id: string
          p_assignment_id: string
          p_expected_version: number
          p_note: string
          p_received_at: string
          p_record_id: string
          p_status: Database["public"]["Enums"]["assignment_work_status"]
        }
        Returns: Json
      }
      record_exam_departure: {
        Args: { p_event_id: string; p_exam_id: string; p_question_id: string }
        Returns: Json
      }
      record_my_exam_departure: {
        Args: {
          p_academy_id: string
          p_event_id: string
          p_exam_id: string
          p_generation: number
          p_question_id: string
          p_token: string
        }
        Returns: Json
      }
      record_quiz_departure: {
        Args: { p_event_id: string; p_quiz_id: string }
        Returns: Json
      }
      redeem_content_coupon: {
        Args: {
          p_academy_id: string
          p_code: string
          p_request_id: string
          p_unit_id: string
        }
        Returns: Json
      }
      refresh_student_import: {
        Args: { p_ordinal: number; p_session_id: string }
        Returns: string
      }
      register_content_asset: {
        Args: {
          p_academy_id: string
          p_id: string
          p_kind: string
          p_mime: string
          p_name: string
          p_unit_id: string
        }
        Returns: string
      }
      release_my_exam_editor: {
        Args: { p_academy_id: string; p_exam_id: string; p_token: string }
        Returns: Json
      }
      remember_attendance_request: {
        Args: {
          p_fingerprint: string
          p_key: string
          p_operation: string
          p_response: Json
          p_session: Database["public"]["Tables"]["sessions"]["Row"]
        }
        Returns: Json
      }
      remove_staff_member: {
        Args: { p_academy_id: string; p_user_id: string }
        Returns: Json
      }
      remove_student_import_entries: {
        Args: {
          p_expected_revision: number
          p_ordinals: number[]
          p_session_id: string
        }
        Returns: number
      }
      renew_my_exam_editor: {
        Args: { p_academy_id: string; p_exam_id: string; p_token: string }
        Returns: Json
      }
      request_content_video_deletion: {
        Args: { p_academy_id: string; p_asset_id: string }
        Returns: string
      }
      require_open_attendance_year: {
        Args: { p_session: Database["public"]["Tables"]["sessions"]["Row"] }
        Returns: undefined
      }
      require_roster_student: {
        Args: {
          p_record_id: string
          p_session: Database["public"]["Tables"]["sessions"]["Row"]
        }
        Returns: undefined
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
      resend_contact_change_code: {
        Args: {
          p_code_hash: string
          p_operation_id: string
          p_session_id: string
          p_stage: string
          p_user_id: string
        }
        Returns: Json
      }
      resolve_assignment_student: {
        Args: { p_academy_id: string; p_assignment_id: string; p_code: string }
        Returns: Json
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
      restore_session: {
        Args: {
          p_academy_id: string
          p_expected_version: number
          p_key: string
          p_session_id: string
        }
        Returns: Json
      }
      restore_staff_member: {
        Args: { p_academy_id: string; p_user_id: string }
        Returns: Json
      }
      revoke_content_access: {
        Args: {
          p_academy_id: string
          p_grant_id: string
          p_reason: string
          p_record_id: string
          p_request_id: string
          p_unit_id: string
        }
        Returns: Json
      }
      revoke_content_coupon: {
        Args: {
          p_academy_id: string
          p_coupon_id: string
          p_request_id: string
        }
        Returns: Json
      }
      revoke_staff_invitation: {
        Args: { p_academy_id: string; p_invitation_id: string }
        Returns: Json
      }
      save_assignment_marks: {
        Args: {
          p_academy_id: string
          p_assignment_id: string
          p_changes: Json
          p_code: string
          p_expected_record_id?: string
          p_expected_version: number
          p_key: string
          p_record_id: string
        }
        Returns: Json
      }
      save_content_unit: {
        Args: {
          p_academy_id: string
          p_document: Json
          p_unit_id: string
          p_version: number
        }
        Returns: number
      }
      save_exam_answers: {
        Args: {
          p_answers: Json
          p_exam_id: string
          p_expected_version: number
          p_key: string
        }
        Returns: Json
      }
      save_exam_marks: {
        Args: {
          p_academy_id: string
          p_changes: Json
          p_exam_id: string
          p_expected_version: number
          p_key: string
          p_record_id: string
        }
        Returns: Json
      }
      save_exam_physical_draft: {
        Args: {
          p_academy_id: string
          p_answers: Json
          p_exam_id: string
          p_expected_version: number
          p_key: string
          p_record_id: string
        }
        Returns: Json
      }
      save_my_exam_answers: {
        Args: {
          p_academy_id: string
          p_answers: Json
          p_exam_id: string
          p_expected_version: number
          p_generation: number
          p_key: string
          p_token: string
        }
        Returns: Json
      }
      save_quiz_answers: {
        Args: {
          p_answers: Json
          p_expected_version: number
          p_key: string
          p_quiz_id: string
        }
        Returns: Json
      }
      save_quiz_marks: {
        Args: {
          p_academy_id: string
          p_changes: Json
          p_expected_version: number
          p_key: string
          p_quiz_id: string
          p_record_id: string
        }
        Returns: Json
      }
      save_quiz_physical_draft: {
        Args: {
          p_academy_id: string
          p_answers: Json
          p_expected_version: number
          p_key: string
          p_quiz_id: string
          p_record_id: string
        }
        Returns: Json
      }
      save_session_content: {
        Args: {
          p_academy_id: string
          p_expected_revision: number
          p_items: Json
          p_key: string
          p_session_id: string
        }
        Returns: Json
      }
      save_student_code_settings: {
        Args: {
          p_academy_id: string
          p_default_pattern: string
          p_enabled: boolean
          p_expected_version: number
          p_levels: Json
        }
        Returns: Json
      }
      search_attendee_candidates: {
        Args: {
          p_academy_id: string
          p_limit: number
          p_offset: number
          p_query: string
          p_session_id: string
        }
        Returns: Json
      }
      session_academy: { Args: { p_session_id: string }; Returns: string }
      session_archive_impact: {
        Args: { p_academy_id: string; p_session_id: string }
        Returns: Json
      }
      session_auto_end_at: {
        Args: { p_now: string; p_schedule_id: string }
        Returns: string
      }
      session_content_options: {
        Args: {
          p_academy_id: string
          p_limit?: number
          p_offset?: number
          p_session_id: string
        }
        Returns: {
          revision: number
          title: string
          unitId: string
        }[]
      }
      set_my_avatar: {
        Args: { p_expected: string; p_path: string }
        Returns: Json
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
      set_student_invite: {
        Args: { p_academy_id: string; p_active: boolean }
        Returns: Json
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
      settle_login_phone_change: {
        Args: { p_end: boolean; p_operation_id: string; p_user_id: string }
        Returns: string
      }
      shares_academy_with: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      staff_can_manage_invitation: {
        Args: {
          actor: string
          actor_role: Database["public"]["Enums"]["academy_role"]
          invitation_creator: string
          invitation_role: Database["public"]["Enums"]["academy_role"]
        }
        Returns: boolean
      }
      staff_invitation_digest: { Args: { p_token: string }; Returns: string }
      staff_invitation_link_ciphertext: {
        Args: { p_academy_id: string; p_invitation_id: string }
        Returns: Json
      }
      staff_invitation_lookup_blocked: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      staff_invitation_response: {
        Args: {
          invitation: Database["public"]["Tables"]["staff_invitations"]["Row"]
          state: string
        }
        Returns: Json
      }
      staff_invitation_state: {
        Args: {
          invitation: Database["public"]["Tables"]["staff_invitations"]["Row"]
          p_actor: string
        }
        Returns: string
      }
      staff_role_can_invite: {
        Args: {
          actor_role: Database["public"]["Enums"]["academy_role"]
          target_role: Database["public"]["Enums"]["academy_role"]
        }
        Returns: boolean
      }
      stage_student_import_rows: {
        Args: { p_rows: Json; p_session_id: string }
        Returns: number
      }
      start_account_password_challenge: {
        Args: {
          p_challenge_id: string
          p_code_hash: string
          p_session_id: string
          p_user_id: string
        }
        Returns: Json
      }
      start_contact_change: {
        Args: {
          p_code_hash: string
          p_expected_old: string
          p_new_phone: string
          p_operation_id: string
          p_purpose: string
          p_session_id: string
          p_user_id: string
        }
        Returns: Json
      }
      start_exam_attempt: { Args: { p_exam_id: string }; Returns: Json }
      start_my_exam: {
        Args: { p_academy_id: string; p_exam_id: string }
        Returns: Json
      }
      start_quiz_attempt: { Args: { p_quiz_id: string }; Returns: Json }
      start_session: {
        Args: {
          p_academy_id: string
          p_schedule_id: string
          p_start_key: string
        }
        Returns: {
          outcome: string
          session_id: string
        }[]
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
      student_code_capacity: {
        Args: {
          p_academy_id: string
          p_after: number
          p_prefix: string
          p_stride: number
          p_width: number
        }
        Returns: number
      }
      student_code_effective_pattern: {
        Args: { p_academy_id: string; p_level_id: string }
        Returns: string
      }
      student_code_generation_before: {
        Args: {
          p_cursor: number
          p_parity: string
          p_start: number
          p_step: number
        }
        Returns: number
      }
      student_code_generation_matches: {
        Args: {
          p_group_id: string
          p_group_ids: string[]
          p_level_id: string
          p_level_ids: string[]
          p_mode: string
        }
        Returns: boolean
      }
      student_code_generation_options: {
        Args: { p_parity: string; p_start: number; p_step: number }
        Returns: undefined
      }
      student_code_generation_scope: {
        Args: {
          p_academy_id: string
          p_ids: string[]
          p_mode: string
          p_year_id: string
        }
        Returns: Record<string, unknown>
      }
      student_code_generation_stride: {
        Args: { p_parity: string; p_step: number }
        Returns: number
      }
      student_code_generation_summary: {
        Args: {
          p_academy_id: string
          p_group_ids: string[]
          p_level_ids: string[]
          p_mode: string
          p_parity: string
          p_start: number
          p_step: number
          p_version: number
          p_year_id: string
        }
        Returns: Json
      }
      student_code_generation_targets: {
        Args: {
          p_academy_id: string
          p_group_ids: string[]
          p_level_ids: string[]
          p_mode: string
          p_year_id: string
        }
        Returns: {
          coded: boolean
          pattern: string
          record_id: string
          record_level_id: string
        }[]
      }
      student_code_next_free: {
        Args: {
          p_academy_id: string
          p_after: number
          p_prefix: string
          p_stride: number
          p_width: number
        }
        Returns: number
      }
      student_code_pattern_prefix: {
        Args: { pattern: string }
        Returns: string
      }
      student_code_pattern_width: { Args: { pattern: string }; Returns: number }
      student_import_cell: {
        Args: { cells: Json; field: string }
        Returns: string
      }
      student_import_fingerprint: {
        Args: { p_session_id: string }
        Returns: string
      }
      student_import_summary: { Args: { p_session_id: string }; Returns: Json }
      submit_exam_attempt: {
        Args: { p_exam_id: string; p_key: string }
        Returns: Json
      }
      submit_my_exam: {
        Args: {
          p_academy_id: string
          p_exam_id: string
          p_expected_version: number
          p_generation: number
          p_key: string
          p_token: string
        }
        Returns: Json
      }
      submit_quiz_attempt: {
        Args: { p_key: string; p_quiz_id: string }
        Returns: Json
      }
      suspend_staff_member: {
        Args: { p_academy_id: string; p_user_id: string }
        Returns: Json
      }
      unretire_student_code: {
        Args: { p_academy_id: string; p_assignment_id: string }
        Returns: Json
      }
      update_assignment: {
        Args: {
          p_academy_id: string
          p_assignment_id: string
          p_draft: Json
          p_expected_version: number
        }
        Returns: Json
      }
      update_exam: {
        Args: {
          p_academy_id: string
          p_draft: Json
          p_exam_id: string
          p_expected_version: number
        }
        Returns: Json
      }
      update_quiz: {
        Args: {
          p_academy_id: string
          p_draft: Json
          p_expected_version: number
          p_quiz_id: string
        }
        Returns: Json
      }
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
      update_student_enrollment_settings: {
        Args: { p_academy_id: string; p_enrollment_open: boolean }
        Returns: Json
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
      verified_account_phone: { Args: { p_user_id: string }; Returns: string }
      verify_account_password_challenge: {
        Args: {
          p_challenge_id: string
          p_code_hash: string
          p_session_id: string
          p_user_id: string
        }
        Returns: string
      }
      verify_contact_change_code: {
        Args: {
          p_code_hash: string
          p_operation_id: string
          p_session_id: string
          p_stage: string
          p_user_id: string
        }
        Returns: string
      }
      verify_student_parent_challenge: {
        Args: { p_challenge_id: string; p_code_hash: string; p_user_id: string }
        Returns: string
      }
      was_removed_from_academy: { Args: { p_slug: string }; Returns: boolean }
      write_attendance: {
        Args: {
          p_check_in: boolean
          p_record_id: string
          p_session: Database["public"]["Tables"]["sessions"]["Row"]
          p_source: Database["public"]["Enums"]["attendance_source"]
          p_status: Database["public"]["Enums"]["attendance_status"]
        }
        Returns: undefined
      }
    }
    Enums: {
      academy_role: "owner" | "head_admin" | "admin" | "instructor"
      assignment_audience: "level" | "program" | "groups"
      assignment_mark_kind: "mark" | "excused"
      assignment_part_kind: "online_questions" | "answer_sheet" | "file_upload"
      assignment_result_effect_type: "result_published" | "result_corrected"
      assignment_state: "active" | "closed" | "archived"
      assignment_work_status:
        | "expected"
        | "submitted"
        | "late"
        | "missing"
        | "excused"
      attendance_effect_type:
        | "explanation_access"
        | "absence_event"
        | "revocation_review"
      attendance_publication_kind: "initial" | "correction"
      attendance_source: "manual" | "bulk" | "check_in"
      attendance_status: "unknown" | "present" | "late" | "absent" | "excused"
      exam_audience: "level" | "program" | "groups"
      exam_correction_kind: "key" | "exclusion"
      exam_effect_type:
        | "result_published"
        | "result_corrected"
        | "solutions_qualified"
      exam_finalization_reason:
        | "submitted"
        | "timer"
        | "kicked"
        | "window_closed"
        | "physical"
      exam_part_kind: "question_sheet" | "written_work"
      exam_source: "online" | "physical"
      quiz_audience: "level" | "program" | "groups"
      quiz_correction_kind: "key" | "exclusion"
      quiz_effect_type:
        | "result_published"
        | "result_corrected"
        | "solutions_qualified"
      quiz_finalization_reason:
        | "submitted"
        | "timer"
        | "departure"
        | "window_closed"
        | "physical"
      quiz_part_kind: "question_sheet" | "written_work"
      quiz_source: "online" | "physical"
      schedule_audience: "group" | "level" | "program"
      schedule_kind: "recurring" | "one_off"
      session_end_reason: "manual" | "auto"
      session_roster_origin: "expected" | "eligible" | "unexpected"
      session_state: "live" | "ended"
      staff_invitation_status: "pending" | "accepted" | "revoked" | "expired"
      student_code_retirement_reason:
        | "manual"
        | "level_changed"
        | "year_closed"
        | "released"
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
      academy_role: ["owner", "head_admin", "admin", "instructor"],
      assignment_audience: ["level", "program", "groups"],
      assignment_mark_kind: ["mark", "excused"],
      assignment_part_kind: ["online_questions", "answer_sheet", "file_upload"],
      assignment_result_effect_type: ["result_published", "result_corrected"],
      assignment_state: ["active", "closed", "archived"],
      assignment_work_status: [
        "expected",
        "submitted",
        "late",
        "missing",
        "excused",
      ],
      attendance_effect_type: [
        "explanation_access",
        "absence_event",
        "revocation_review",
      ],
      attendance_publication_kind: ["initial", "correction"],
      attendance_source: ["manual", "bulk", "check_in"],
      attendance_status: ["unknown", "present", "late", "absent", "excused"],
      exam_audience: ["level", "program", "groups"],
      exam_correction_kind: ["key", "exclusion"],
      exam_effect_type: [
        "result_published",
        "result_corrected",
        "solutions_qualified",
      ],
      exam_finalization_reason: [
        "submitted",
        "timer",
        "kicked",
        "window_closed",
        "physical",
      ],
      exam_part_kind: ["question_sheet", "written_work"],
      exam_source: ["online", "physical"],
      quiz_audience: ["level", "program", "groups"],
      quiz_correction_kind: ["key", "exclusion"],
      quiz_effect_type: [
        "result_published",
        "result_corrected",
        "solutions_qualified",
      ],
      quiz_finalization_reason: [
        "submitted",
        "timer",
        "departure",
        "window_closed",
        "physical",
      ],
      quiz_part_kind: ["question_sheet", "written_work"],
      quiz_source: ["online", "physical"],
      schedule_audience: ["group", "level", "program"],
      schedule_kind: ["recurring", "one_off"],
      session_end_reason: ["manual", "auto"],
      session_roster_origin: ["expected", "eligible", "unexpected"],
      session_state: ["live", "ended"],
      staff_invitation_status: ["pending", "accepted", "revoked", "expired"],
      student_code_retirement_reason: [
        "manual",
        "level_changed",
        "year_closed",
        "released",
      ],
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
