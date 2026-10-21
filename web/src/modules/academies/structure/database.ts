import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

/** Pending a type export from an authorized migrated schema. Keep this boundary explicit. */
type StructureDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      get_academy_structure: { Args: { p_academy_id: string }; Returns: Json };
      get_offering_track_labels: { Args: { p_academy_id: string }; Returns: { track_id: string; academic_year_id: string; name: string }[] };
      offering_startable_schedules: { Args: { p_academy_id: string }; Returns: Database["public"]["Tables"]["schedules"]["Row"][] };
      preview_offering_change: { Args: { p_academy_id: string; p_change: Json }; Returns: Json };
      maintain_academy_offering: {
        Args: { p_academy_id: string; p_change: Json; p_expected_revision: number; p_fingerprint: string; p_request_key: string };
        Returns: Json;
      };
    };
  };
};
export type StructureDb = SupabaseClient<StructureDatabase>;
