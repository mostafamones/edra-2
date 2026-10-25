import "server-only";
import { z } from "zod";
import { cookieAuthority } from "@/lib/supabase/authority";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { isAcademyManager } from "@/modules/academies/roles";
import { readOfferingTrackLabels } from "@/modules/academies/structure";
import { documentSchema, type ContentUnit, type ContentResult } from "./types";

/** Return safe action errors explicitly; Next.js hides thrown server errors in production. */
export async function contentResult<T>(run: () => Promise<T>): Promise<ContentResult<T>> {
  try { return { ok: true, value: await run() }; }
  catch (error) { return { ok: false, message: error instanceof z.ZodError ? "Check the fields and try again." : error instanceof Error ? error.message : "Could not complete this change. Please retry." }; }
}

export async function contentCaller(academyId: string) {
  if (!z.guid().safeParse(academyId).success) throw new Error("Invalid academy.");
  const caller = await cookieAuthority();
  if (!caller) throw new Error("Sign in to continue.");
  const { data, error } = await caller.db.from("academy_memberships").select("role").eq("academy_id", academyId).eq("user_id", caller.userId).is("suspended_at", null).maybeSingle();
  if (error || !data) throw new Error("You no longer have access to this academy.");
  return { ...caller, manager: isAcademyManager(data.role) };
}
export function contentError(error: { message?: string } | null) {
  if (!error) return;
  const messages: Record<string, string> = {
    coupon_type_mismatch: "Choose a coupon type from this unit’s academic scope.",
    invalid_prerequisite: "Choose assignments or quizzes from another published unit in this academic scope.",
    prerequisite_cycle: "These prerequisites would create a circular dependency.",
    asset_in_use: "This video is still used by a saved draft or published history. Remove it from drafts and save first. Published videos must be preserved.", asset_deleting: "This video is being permanently deleted and cannot be attached.",
    forbidden: "You do not have permission to make this change.", content_conflict: "Someone changed this unit. Reload it before saving again.", year_closed: "This academic year is closed. Its content is read-only.", archived: "Restore this unit before editing it.", explanation_required: "Add at least one ready explanation video before publishing.", assets_not_ready: "Wait until every attached upload is ready before publishing.", incompatible_assessment: "The assessment must belong to this academy/year and fit the entire program audience.", assessment_already_attached: "This assessment already belongs to another unit. Copy it instead.", attachment_locked: "This assessment has recorded work and cannot be detached or moved.", published_source_required: "Choose a published unit to copy.", answer_requires_assessment: "Attach the assessment before adding its answer video.", invalid_asset: "This file is not available to this unit.", validation: "Check the unit fields and materials.",
  };
  throw new Error(messages[error.message ?? ""] ?? "Could not complete this change. Please retry.");
}
export async function readContentWorkspace(academyId: string) {
  const { db, userId, manager } = await contentCaller(academyId);
  const [units, programs, years, levels, tracks, names, availableTracks, trackYearLabels] = await Promise.all([
    fetchAllPages((from, to) => db.from("content_units").select("*").eq("academy_id", academyId).order("updated_at", { ascending: false }).order("id").range(from, to)),
    db.from("content_programs").select("*").eq("academy_id", academyId), db.from("academic_years").select("id,start_year,closed_at").eq("academy_id", academyId).order("start_year", { ascending: false }),
    db.from("academy_levels").select("level_id,sort_order").eq("academy_id", academyId).is("stopped_at", null).order("sort_order"), db.from("academy_tracks").select("id,level_id,name").eq("academy_id", academyId), db.from("global_levels").select("id,name"),
    db.from("academy_tracks").select("id,level_id,name").eq("academy_id", academyId).is("retired_at", null),
    readOfferingTrackLabels(academyId, db),
  ]);
  for (const response of [programs, years, levels, tracks, names, availableTracks]) contentError(response.error);
  const offered = new Set((levels.data ?? []).map(level => level.level_id));
  return { units: units.map(u => ({ ...u, draft: documentSchema.parse(u.draft) })) as ContentUnit[], programs: programs.data ?? [], years: years.data ?? [], levels: levels.data ?? [],
    tracks: (availableTracks.data ?? []).filter(track => offered.has(track.level_id)), historicalTracks: tracks.data ?? [], trackYearLabels,
    levelNames: Object.fromEntries((names.data ?? []).map(l => [l.id, l.name])) as Record<string, string>, userId, manager };
}
export type ContentWorkspace = Awaited<ReturnType<typeof readContentWorkspace>>;
export async function readContentUnit(academyId: string, unitId: string) {
  z.guid().parse(unitId);
  const { db, userId, manager } = await contentCaller(academyId);
  const { data: unit, error } = await db.from("content_units").select("*").eq("academy_id", academyId).eq("id", unitId).single();
  contentError(error);
  if (!unit) throw new Error("Unit not found.");
  const document = documentSchema.parse(unit.draft);
  const referencedAssets = [...new Set(document.items.flatMap(item => item.assetId ? [item.assetId] : []))];
  const [program, assets, feedback, revisions] = await Promise.all([
    db.from("content_programs").select("*,academic_years(start_year,closed_at)").eq("id", unit.program_id).single(),
    fetchAllPages((from, to) => db.from("content_assets").select("*").eq("academy_id", academyId)
      .or(`unit_id.eq.${unitId}${referencedAssets.length ? `,id.in.(${referencedAssets.join(",")})` : ""}`).order("created_at").order("id").range(from, to)),
    db.from("content_feedback").select("*").eq("academy_id", academyId).eq("unit_id", unitId).order("created_at"), db.from("content_revisions").select("revision,document,published_at").eq("academy_id", academyId).eq("unit_id", unitId).order("revision", { ascending: false }),
  ]);
  for (const response of [program, feedback, revisions]) contentError(response.error);
  const [level, track, historicalLabels] = await Promise.all([
    db.from("global_levels").select("name").eq("id", program.data!.level_id).single(),
    program.data!.track_id ? db.from("academy_tracks").select("name").eq("id", program.data!.track_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    readOfferingTrackLabels(academyId, db),
  ]);
  contentError(level.error); contentError(track.error);
  const trackName = historicalLabels.find(label => label.track_id === program.data!.track_id && label.academic_year_id === program.data!.academic_year_id)?.name ?? track.data?.name;
  const programLabel = `${level.data?.name ?? program.data!.level_id}${trackName ? ` · ${trackName}` : " · All tracks"}`;
  return { unit: { ...unit, draft: document } as ContentUnit, program: program.data!, programLabel, assets, feedback: feedback.data ?? [], revisions: revisions.data ?? [], userId, manager };
}
export type ContentDetail = Awaited<ReturnType<typeof readContentUnit>>;
/** Stored drafts and publications of one unit, newest first, with the names of who wrote them. */
export async function readUnitHistory(academyId: string, unitId: string) {
  z.guid().parse(unitId);
  const { db } = await contentCaller(academyId);
  // shortcut: only the latest 200 draft saves are shown; page the query if units outgrow that.
  const [drafts, revisions] = await Promise.all([
    db.from("content_drafts").select("id,kind,document,saved_by,saved_at").eq("academy_id", academyId).eq("unit_id", unitId).order("saved_at", { ascending: false }).order("id", { ascending: false }).limit(200),
    db.from("content_revisions").select("revision,document,published_by,published_at").eq("academy_id", academyId).eq("unit_id", unitId).order("revision", { ascending: false }),
  ]);
  contentError(drafts.error); contentError(revisions.error);
  const ids = [...new Set([...(drafts.data ?? []).flatMap(d => d.saved_by ? [d.saved_by] : []), ...(revisions.data ?? []).map(r => r.published_by)])];
  // Profiles are readable for people who share the academy; anyone else shows as an unnamed staff member.
  const profiles = ids.length ? await db.from("profiles").select("id,full_name,display_name,avatar_path").in("id", ids) : { data: [], error: null };
  contentError(profiles.error);
  // Private bucket: avatars come through signed URLs; a failure just leaves initials.
  const paths = (profiles.data ?? []).flatMap(p => p.avatar_path ?? []);
  const signed = paths.length ? (await db.storage.from("avatars").createSignedUrls(paths, 60 * 60)).data : null;
  const urls = new Map(signed?.flatMap(entry => entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl] as const] : []));
  const people = new Map((profiles.data ?? []).map(p => [p.id, { id: p.id, name: p.display_name || p.full_name, avatarUrl: p.avatar_path ? urls.get(p.avatar_path) : undefined }]));
  return {
    drafts: (drafts.data ?? []).map(d => ({ kind: d.kind as "created" | "saved", document: d.document, at: d.saved_at, by: (d.saved_by && people.get(d.saved_by)) || null })),
    revisions: (revisions.data ?? []).map(r => ({ revision: r.revision, document: r.document, at: r.published_at, by: people.get(r.published_by) || null })),
  };
}
export type UnitHistory = Awaited<ReturnType<typeof readUnitHistory>>;
