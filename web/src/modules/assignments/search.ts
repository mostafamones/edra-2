import "server-only";
import { academyMember } from "@/lib/supabase/membership";
import { literalSearch, type SearchRecord } from "@/lib/search";

export async function searchStaffAssignments(academyId: string, yearId: string, search: string): Promise<SearchRecord[]> {
  const caller = await academyMember(academyId);
  if (!caller) throw new Error("You no longer have access to this academy.");
  const { data, error } = await caller.db.from("assignments").select("id,title,state")
    .eq("academy_id", academyId).eq("academic_year_id", yearId).neq("state", "archived")
    .ilike("title", literalSearch(search)).order("updated_at", { ascending: false }).order("id").limit(6);
  if (error) throw new Error("Assignment search is unavailable.");
  if (!data?.length) return [];
  const links = await caller.db.from("content_assessments").select("assessment_id,unit_id")
    .eq("academy_id", academyId).eq("kind", "assignment").in("assessment_id", data.map(row => row.id));
  if (links.error) throw new Error("Assignment search is unavailable.");
  const ids = [...new Set((links.data ?? []).map(row => row.unit_id))];
  const units = ids.length ? await caller.db.from("content_units").select("id,draft").eq("academy_id", academyId).in("id", ids) : { data: [], error: null };
  if (units.error) throw new Error("Assignment search is unavailable.");
  return data.map(row => {
    const link = links.data?.find(item => item.assessment_id === row.id);
    const unit = units.data?.find(item => item.id === link?.unit_id);
    return { id: row.id, title: row.title, detail: `${row.state === "active" ? "Active" : "Closed"} · ${unit ? (unit.draft as { title: string }).title : "Standalone"}`, path: `assignments/${row.id}` };
  });
}
