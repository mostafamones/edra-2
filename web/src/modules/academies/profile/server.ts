import "server-only";

import { createClient } from "../../../lib/supabase/server";
import { isAcademyProfileEditor, type AcademyRole } from "../roles";
import { resolveStaffAcademy } from "../server";
import { ACADEMY_ICON_IDS } from "../validation";
import type { AcademyProfile } from "./validation";

export const PROFILE_COLUMNS = "id, slug, name, icon, subject, phone, whatsapp, updated_at";

type ProfileRow = { id: string; slug: string; name: string; icon: string; subject: string; phone: string | null; whatsapp: string | null; updated_at: string };

export function toAcademyProfile(row: ProfileRow, role: AcademyRole): AcademyProfile {
  // The database constraint already limits icons to this list.
  const icon = row.icon as (typeof ACADEMY_ICON_IDS)[number];
  return { id: row.id, slug: row.slug, name: row.name, icon, subject: row.subject, phone: row.phone, whatsapp: row.whatsapp,
    updatedAt: row.updated_at, canEdit: isAcademyProfileEditor(role) };
}

/** Session-bound read for the caller's active membership; null when the academy is unknown or inaccessible. Throws on load failure. */
export async function getAcademyProfile(slug: string): Promise<AcademyProfile | null> {
  const academy = await resolveStaffAcademy(slug);
  if (!academy) return null;
  const db = await createClient();
  const { data, error } = await db.from("academies").select(PROFILE_COLUMNS).eq("id", academy.id).maybeSingle();
  if (error) throw error;
  return data && toAcademyProfile(data, academy.role);
}
