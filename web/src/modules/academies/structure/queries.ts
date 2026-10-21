import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import type { Db } from "@/lib/supabase/authority";
import type { StructureDb } from "./database";

/** Session-bound label read, usable by browser queries or an existing verified server authority. */
export async function readOfferingTrackLabels(academyId: string, db: Db = createClient()) {
  const { data, error } = await (db as unknown as StructureDb).rpc("get_offering_track_labels", { p_academy_id: academyId });
  if (error) throw new Error(error.message);
  return z.array(z.object({ track_id: z.uuid(), academic_year_id: z.uuid(), name: z.string() })).parse(data);
}

/** Filter before pagination. The database resolves group scope and live offering availability. */
export function startableOfferingSchedules(academyId: string, db: Db = createClient()) {
  return (db as unknown as StructureDb).rpc("offering_startable_schedules", { p_academy_id: academyId });
}
