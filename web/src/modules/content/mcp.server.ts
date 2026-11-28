import "@tanstack/react-start/server-only";
import type { Authority } from "@/lib/supabase/authority";
import { documentSchema } from "./types";

export async function listMcpLessons({ db }: Authority, academyId: string, after?: string) {
  let query = db.from("content_units").select("id,state,version,updated_at,title:draft->>title")
    .eq("academy_id", academyId).order("id").limit(21);
  if (after) query = query.gt("id", after);
  const { data, error } = await query;
  if (error) throw new Error("Unable to list lessons.");
  return { lessons: data.slice(0, 20), nextCursor: data.length > 20 ? data[19].id : null };
}

async function read({ db }: Authority, academyId: string, id: string) {
  const { data, error } = await db.from("content_units").select("id,version,state,draft")
    .eq("academy_id", academyId).eq("id", id).maybeSingle();
  if (error) throw new Error("Unable to read lesson.");
  if (!data) throw new Error("Lesson unavailable in this academy.");
  return data;
}

export async function getMcpLesson(authority: Authority, academyId: string, id: string) {
  const row = await read(authority, academyId, id);
  const { title, description, items } = documentSchema.parse(row.draft);
  return { id, version: row.version, state: row.state, title, description,
    materials: items.map(({ kind, title }) => ({ kind, title })) };
}

export async function updateMcpLesson(authority: Authority, academyId: string,
  { id, version, ...fields }: { id: string; version: number; title?: string; description?: string }) {
  const row = await read(authority, academyId, id);
  const conflict = "The lesson changed. Read it again before attempting another edit.";
  if (row.version !== version) throw new Error(conflict);
  // Validate the resulting document, but preserve all existing fields in the stored draft.
  if (typeof row.draft !== "object" || row.draft === null || Array.isArray(row.draft)) throw new Error("Invalid lesson draft.");
  const draft = { ...row.draft, ...fields };
  documentSchema.parse(draft);
  const { data, error } = await authority.db.rpc("save_content_unit", {
    p_academy_id: academyId, p_unit_id: id, p_version: version, p_document: draft,
  });
  if (error) {
    if (error.message === "content_conflict") throw new Error(conflict);
    if (error.message === "forbidden" || error.code === "42501") throw new Error("You cannot edit this lesson.");
    if (error.message === "year_closed" || error.message === "archived") throw new Error("This lesson is read-only.");
    throw new Error("Unable to save lesson draft.");
  }
  return { id, version: data, ...fields };
}
