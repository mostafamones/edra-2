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
      assignment_marks: {
        Row: {
          academy_id: string
          annual_student_record_id: string
          assignment_id: string
          from_answers: boolean
          kind: Database["public"]["Enums"]["assignment_mark_kind"]
          part_id: string
          reason: string | null
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
      assignment_part_questions: {
        Row: {
          academy_id: string
          assignment_id: string
          id: string
          max_score: number
          part_id: string
          position: number
          prompt: string
        }
        Insert: {
          academy_id: string
          assignment_id: string
          id?: string
          max_score: number
          part_id: string
          position: number
          prompt?: string
        }
        Update: {
          academy_id?: string
          assignment_id?: string
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
      assignments: {
        Row: {
          academic_year_id: string
          academy_id: string
          archived_at: string | null
          archived_by: string | null
          audience: Database["public"]["Enums"]["assignment_audience"]
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string
          due_at: string | null
          id: string
          instructions: string
          level_id: string | null
          max_score: number
          part_count: number
          published_at: string | null
          published_by: string | null
          recipient_count: number
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
          created_at?: string
          created_by: string
          due_at?: string | null
          id: string
          instructions?: string
          level_id?: string | null
          max_score?: number
          part_count?: number
          published_at?: string | null
          published_by?: string | null
          recipient_count?: number
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
          created_at?: string
          created_by?: string
          due_at?: string | null
          id?: string
          instructions?: string
          level_id?: string | null
          max_score?: number
          part_count?: number
          published_at?: string | null
          published_by?: string | null
          recipient_count?: number
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
      session_roster_entries: {
        Row: {
          academic_year_id: string
          academy_id: string
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
        ]
      }
      sessions: {
        Row: {
          academic_year_id: string
          academy_id: string
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
      accept_staff_invitation: { Args: { p_token: string }; Returns: Json }
      allocate_student_code: {
        Args: { p_academy_id: string; p_level_id: string }
        Returns: string
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
      attendance_entry: {
        Args: { p_record_id: string; p_session_id: string }
        Returns: Json
      }
      attendance_pending: { Args: { p_session_id: string }; Returns: boolean }
      attendance_replay: {
        Args: { p_fingerprint: string; p_key: string; p_operation: string }
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
      cancel_student_import: {
        Args: { p_session_id: string }
        Returns: undefined
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
      consume_api_quota: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
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
      end_session: {
        Args: { p_academy_id: string; p_session_id: string }
        Returns: string
      }
      expire_sessions: { Args: { p_schedule_id: string }; Returns: undefined }
      finalize_student_import: {
        Args: { p_session_id: string }
        Returns: number
      }
      finish_student_profile: {
        Args: { p_level_id: string; p_user_id: string }
        Returns: boolean
      }
      force_delete_session: {
        Args: { p_academy_id: string; p_session_id: string }
        Returns: undefined
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
      get_assignment: {
        Args: { p_academy_id: string; p_assignment_id: string }
        Returns: Json
      }
      get_attendance: {
        Args: { p_academy_id: string; p_session_id: string }
        Returns: Json
      }
      get_session: {
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
      is_academy_member: {
        Args: { target_academy_id: string }
        Returns: boolean
      }
      is_assignment_image_staff: { Args: { p_name: string }; Returns: boolean }
      list_assignment_marks: {
        Args: {
          p_academy_id: string
          p_assignment_id: string
          p_filter?: string
          p_limit?: number
          p_offset?: number
        }
        Returns: Json
      }
      list_assignment_recipients: {
        Args: { p_academy_id: string; p_assignment_id: string }
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
      list_past_sessions: {
        Args: {
          p_academy_id: string
          p_before_id: string
          p_before_started_at: string
          p_from: string
          p_limit: number
          p_search: string
          p_to: string
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
      refresh_student_import: {
        Args: { p_ordinal: number; p_session_id: string }
        Returns: string
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
      session_academy: { Args: { p_session_id: string }; Returns: string }
      session_auto_end_at: {
        Args: { p_now: string; p_schedule_id: string }
        Returns: string
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
      verified_account_phone: { Args: { p_user_id: string }; Returns: string }
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
      academy_role: "owner" | "admin" | "instructor"
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
      schedule_audience: "group" | "level" | "program"
      schedule_kind: "recurring" | "one_off"
      session_end_reason: "manual" | "auto"
      session_roster_origin: "expected" | "eligible"
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
      academy_role: ["owner", "admin", "instructor"],
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
      schedule_audience: ["group", "level", "program"],
      schedule_kind: ["recurring", "one_off"],
      session_end_reason: ["manual", "auto"],
      session_roster_origin: ["expected", "eligible"],
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
