import { z } from "zod";

import { createClient } from "@/lib/supabase/client";

const membershipRowsSchema = z.array(
  z.object({
    academy_id: z.uuid(),
    role: z.enum(["owner", "admin", "instructor"]),
    academies: z.object({ name: z.string() }),
  }),
);

export type AcademyEntry = {
  id: string;
  name: string;
  role: "owner" | "admin" | "instructor";
};

/** RLS limits the result to memberships visible to the signed-in user. */
export async function listUserAcademies(userId: string): Promise<AcademyEntry[]> {
  const { data, error } = await createClient()
    .from("academy_memberships")
    .select("academy_id, role, academies!inner(name)")
    .eq("user_id", userId);

  if (error) throw error;

  return membershipRowsSchema.parse(data ?? []).map((row) => ({
    id: row.academy_id,
    name: row.academies.name,
    role: row.role,
  }));
}
