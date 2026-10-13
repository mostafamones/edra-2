import { z } from "zod";

import { createClient } from "@/lib/supabase/client";

import { academyRoleSchema, type AcademyRole } from "./roles";

const membershipRowsSchema = z.array(
  z.object({
    academy_id: z.uuid(),
    role: academyRoleSchema,
    academies: z.object({ name: z.string(), slug: z.string(), icon: z.string() }),
  }),
);

export type AcademyEntry = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  role: AcademyRole;
};

/** Active memberships only. RLS also hides a suspended membership from its own member. */
export async function listUserAcademies(userId: string): Promise<AcademyEntry[]> {
  const { data, error } = await createClient()
    .from("academy_memberships")
    .select("academy_id, role, academies!inner(name, slug, icon)")
    .eq("user_id", userId)
    .is("suspended_at", null);

  if (error) throw error;

  return membershipRowsSchema.parse(data ?? []).map((row) => ({
    id: row.academy_id,
    name: row.academies.name,
    slug: row.academies.slug,
    icon: row.academies.icon,
    role: row.role,
  }));
}
