import "server-only";
import { academyMember } from "@/lib/supabase/membership";
import { literalSearch, type SearchRecord } from "@/lib/search";
import { GLOBAL_LEVELS } from "@/modules/academies";
import { STATE_LABELS, type ContentUnit } from "./types";

export async function searchStaffContent(academyId: string, yearId: string, search: string): Promise<SearchRecord[]> {
  const caller = await academyMember(academyId);
  if (!caller) throw new Error("You no longer have access to this academy.");
  const { data, error } = await caller.db.from("content_units")
    .select("id,state,draft,content_programs!inner(academic_year_id,level_id)")
    .eq("academy_id", academyId).eq("content_programs.academic_year_id", yearId).neq("state", "archived")
    .ilike("draft->>title", literalSearch(search)).order("updated_at", { ascending: false }).order("id").limit(6);
  if (error) throw new Error("Content search is unavailable.");
  return (data ?? []).map(unit => ({ id: unit.id, title: (unit.draft as { title: string }).title,
    detail: `${STATE_LABELS[unit.state as ContentUnit["state"]]} · ${GLOBAL_LEVELS.find(level => level.id === unit.content_programs.level_id)?.label ?? "Content unit"}`, path: `content/${unit.id}` }));
}
