import "server-only";
import { z } from "zod";
import { academyMember } from "@/lib/supabase/membership";
import type { Authority } from "@/lib/supabase/authority";
import { targetSchema, saveTaughtSchema, taughtSheetSchema, taughtItemSchema, taughtResultSchema } from "./types";

const MESSAGES: Record<string, string> = {
  forbidden: "You no longer have permission to access this session.",
  not_found: "This session was not found in the selected academy.",
  content_conflict: "Someone changed the taught units. Reload the saved units before trying again.",
  content_finalized: "Attendance is finalized. The taught units are locked.",
  session_archived: "This session is archived and read-only.",
  year_unavailable: "This academic year is closed and read-only.",
  content_unavailable: "A selected unit changed or is no longer published. Refresh the available units and choose it again.",
  incompatible_content: "Choose published units matching this session’s academic year, grade and track.",
  idempotency_conflict: "This request was already used for a different change. Reload the saved units.",
  throttled: "Too many changes. Wait a moment and try again.",
  validation: "Check the selected units and try again.",
};
function check(error: { message?: string } | null) { if (error) throw new Error(MESSAGES[error.message ?? ""] ?? "Could not complete this change. Please retry."); }

export async function readTaught(value: unknown, authority?: Authority | null) {
  const input = targetSchema.parse(value), actor = await academyMember(input.academyId, authority);
  if (!actor) throw new Error(MESSAGES.forbidden);
  const { data, error } = await actor.db.rpc("get_session_content", { p_academy_id: input.academyId, p_session_id: input.sessionId });
  check(error); return taughtSheetSchema.parse(data);
}
export async function readTaughtOptions(value: unknown, authority?: Authority | null) {
  const input = targetSchema.parse(value), actor = await academyMember(input.academyId, authority);
  if (!actor) throw new Error(MESSAGES.forbidden);
  const all: z.infer<typeof taughtItemSchema>[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await actor.db.rpc("session_content_options", { p_academy_id: input.academyId, p_session_id: input.sessionId, p_offset: offset, p_limit: 100 });
    check(error); const rows = z.array(taughtItemSchema).parse(data); all.push(...rows);
    if (rows.length < 100) return all;
  }
}
export async function writeTaught(value: unknown, authority?: Authority | null) {
  const input = saveTaughtSchema.parse(value), actor = await academyMember(input.academyId, authority);
  if (!actor) throw new Error(MESSAGES.forbidden);
  const { data, error } = await actor.db.rpc("save_session_content", {
    p_academy_id: input.academyId, p_session_id: input.sessionId, p_expected_revision: input.expectedRevision, p_key: input.key, p_items: input.items,
  });
  check(error); return taughtResultSchema.parse(data);
}
