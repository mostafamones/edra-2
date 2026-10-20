import "server-only";

import { z } from "zod";

import { cookieAuthority, type Authority, type Db } from "@/lib/supabase/authority";
import { academyMember } from "@/lib/supabase/membership";
import type { Database } from "@/lib/supabase/database.types";
import { decodeCursor, DEFAULT_PAGE_SIZE, encodeCursor, MAX_PAGE_SIZE } from "./cursor";
import { HISTORY_ARCHIVE_FILTERS, type HistoryArchiveFilter, type LiveSessionPage, type PastSessionPage, type ReadResult, type SessionDetail } from "./types";

/**
 * Server-only session reads. Every read runs through the caller's Supabase session, so RLS limits
 * it to academies the caller belongs to; academy-scoped reads also verify membership first. Pass an
 * `authority` for token-authenticated API requests; it defaults to the request's cookie session.
 */

type Enums = Database["public"]["Enums"];
type ListArgs = Database["public"]["Functions"]["list_live_sessions"]["Args"];

/** The caller's client and role in the academy, or null when they are not an active staff member. */
export async function sessionActor(academyId: string, authority?: Authority | null) {
  return academyMember(academyId, authority);
}

async function signedIn(authority?: Authority | null): Promise<Db | null> {
  return (authority ?? await cookieAuthority())?.db ?? null;
}

/** The academy of a session the caller can see (RLS), or null for unknown and foreign sessions. */
export async function sessionAcademy(sessionId: string, authority?: Authority | null): Promise<string | null> {
  if (!z.uuid().safeParse(sessionId).success) return null;
  const db = await signedIn(authority);
  if (!db) return null;
  const { data, error } = await db.rpc("session_academy", { p_session_id: sessionId });
  if (error) throw error;
  return typeof data === "string" ? data : null;
}

const enumOf = <T extends string>(values: readonly [T, ...T[]]) => z.enum(values);
const summaryShape = {
  id: z.string(),
  academy_id: z.string(),
  academic_year_id: z.string(),
  schedule_id: z.string(),
  schedule_title: z.string(),
  schedule_kind: enumOf<Enums["schedule_kind"]>(["recurring", "one_off"]),
  audience: enumOf<Enums["schedule_audience"]>(["group", "level", "program"]),
  group_id: z.string().nullable(),
  group_name: z.string().nullable(),
  level_id: z.string(),
  level_name: z.string().nullable(),
  track_id: z.string().nullable(),
  track_name: z.string().nullable(),
  mandatory: z.boolean(),
  location: z.string().nullable(),
  state: enumOf<Enums["session_state"]>(["live", "ended"]),
  started_at: z.string(),
  started_by: z.string(),
  started_by_name: z.string().nullable(),
  auto_end_at: z.string(),
  metadata_version: z.number().int(),
};
const liveRowSchema = z.object({
  ...summaryShape,
  academy_name: z.string(),
  academy_slug: z.string(),
  roster_count: z.number().int().nonnegative(),
});
const pastRowSchema = liveRowSchema.extend({
  ended_at: z.string(),
  ended_by_name: z.string().nullable(),
  end_reason: enumOf<Enums["session_end_reason"]>(["manual", "auto"]),
  // Archival fields are optional so reads still parse against a database without them.
  archived_at: z.string().nullish(),
  archived_by_name: z.string().nullish(),
});
const rosterRowSchema = z.object({
  annual_student_record_id: z.string(),
  academy_student_profile_id: z.string(),
  full_name: z.string(),
  archived: z.boolean(),
  origin: enumOf<Enums["session_roster_origin"]>(["expected", "eligible", "unexpected"]),
  student_phone: z.string(),
  parent_phone: z.string(),
  level_id: z.string(),
  level_name: z.string().nullable(),
  track_id: z.string().nullable(),
  track_name: z.string().nullable(),
  primary_group_id: z.string().nullable(),
  group_name: z.string().nullable(),
  participation_type: enumOf<Enums["student_participation_type"]>(["in_person", "online_only"]),
});
const detailSchema = z.object({
  session: z.object({
    ...summaryShape,
    ended_at: z.string().nullable(),
    ended_by: z.string().nullable(),
    ended_by_name: z.string().nullable(),
    end_reason: enumOf<Enums["session_end_reason"]>(["manual", "auto"]).nullable(),
    archived_at: z.string().nullish(),
    archived_by_name: z.string().nullish(),
    archive_note: z.string().nullish(),
    year_open: z.boolean().optional(),
    can_manage_archive: z.boolean().optional(),
  }),
  roster: z.array(rosterRowSchema),
  archive_impact: z.object({
    roster_count: z.number().int(), official_count: z.number().int(), draft_count: z.number().int(), pending_effects: z.number().int(),
  }).nullish(),
  archive_events: z.array(z.object({
    action: z.enum(["archived", "restored"]),
    ended_live: z.boolean(),
    note: z.string().nullable(),
    actor_name: z.string().nullable(),
    occurred_at: z.string(),
  })).optional(),
});

const toSummary = (row: z.infer<z.ZodObject<typeof summaryShape>>) => ({
  id: row.id,
  academyId: row.academy_id,
  academicYearId: row.academic_year_id,
  scheduleId: row.schedule_id,
  scheduleTitle: row.schedule_title,
  scheduleKind: row.schedule_kind,
  audience: row.audience,
  groupId: row.group_id,
  groupName: row.group_name,
  levelId: row.level_id,
  levelName: row.level_name,
  trackId: row.track_id,
  trackName: row.track_name,
  mandatory: row.mandatory,
  location: row.location,
  state: row.state,
  startedAt: row.started_at,
  startedBy: row.started_by,
  startedByName: row.started_by_name,
  autoEndAt: row.auto_end_at,
  metadataVersion: row.metadata_version,
});

export type LiveSessionQuery = {
  /** Limit to one academy; omit to list every academy the caller belongs to. */
  academyId?: string | null;
  cursor?: string | null;
  limit?: number | null;
};

/** Reads `academy`, `cursor`, and `limit` search parameters; null when any is malformed. */
export function readLiveSessionQuery(params: URLSearchParams): LiveSessionQuery | null {
  const academyId = params.get("academy");
  const cursor = params.get("cursor");
  const limitText = params.get("limit");
  const limit = limitText === null ? null : Number(limitText);
  if (academyId !== null && !z.uuid().safeParse(academyId).success) return null;
  if (cursor !== null && !decodeCursor(cursor)) return null;
  if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE)) return null;
  return { academyId, cursor, limit };
}

/** Live sessions, newest first, with keyset pagination. */
export async function listLiveSessions(query: LiveSessionQuery = {}, authority?: Authority | null): Promise<ReadResult<LiveSessionPage>> {
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (query.cursor && !cursor) return { ok: false, status: 400 };
  const limit = query.limit ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) return { ok: false, status: 400 };
  let db: Db | null;
  if (query.academyId) {
    const actor = await sessionActor(query.academyId, authority);
    if (!actor) return { ok: false, status: 403 };
    db = actor.db;
  } else {
    db = await signedIn(authority);
    if (!db) return { ok: false, status: 401 };
  }
  try {
    // One extra row tells whether another page exists. The generator types RPC arguments as non-null.
    const { data, error } = await db.rpc("list_live_sessions", {
      p_academy_id: query.academyId ?? null,
      p_before_started_at: cursor?.startedAt ?? null,
      p_before_id: cursor?.id ?? null,
      p_limit: limit + 1,
    } as unknown as ListArgs);
    if (error) return { ok: false, status: 500 };
    const rows = z.array(liveRowSchema).parse(data);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      ok: true,
      data: {
        sessions: page.map((row) => ({
          ...toSummary(row), academyName: row.academy_name, academySlug: row.academy_slug, rosterCount: row.roster_count,
        })),
        nextCursor: rows.length > limit && last ? encodeCursor({ startedAt: last.started_at, id: last.id }) : null,
      },
    };
  } catch {
    return { ok: false, status: 500 };
  }
}

/** `from` and `to` are inclusive academy-time days, "YYYY-MM-DD". `archive` defaults to "active". */
export type SessionHistoryQuery = LiveSessionQuery & {
  search?: string | null; from?: string | null; to?: string | null; archive?: HistoryArchiveFilter | null;
};

/**
 * Reads the live-list parameters plus `q` (search text, up to 100 characters), `from`/`to` days and
 * `archive` (active, archived or all).
 */
export function readSessionHistoryQuery(params: URLSearchParams): SessionHistoryQuery | null {
  const base = readLiveSessionQuery(params);
  const search = params.get("q");
  const from = params.get("from");
  const to = params.get("to");
  const archive = params.get("archive");
  const isDay = (value: string | null) => value === null || z.iso.date().safeParse(value).success;
  if (!base || (search !== null && search.length > 100) || !isDay(from) || !isDay(to) || (from && to && from > to)) return null;
  if (archive !== null && !(HISTORY_ARCHIVE_FILTERS as readonly string[]).includes(archive)) return null;
  return { ...base, search, from, to, archive: archive as HistoryArchiveFilter | null };
}

/** Ended and auto-closed sessions, newest first, optionally searched, with keyset pagination. Unarchived only unless `archive` says otherwise. */
export async function listSessionHistory(query: SessionHistoryQuery = {}, authority?: Authority | null): Promise<ReadResult<PastSessionPage>> {
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (query.cursor && !cursor) return { ok: false, status: 400 };
  const limit = query.limit ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) return { ok: false, status: 400 };
  let db: Db | null;
  if (query.academyId) {
    const actor = await sessionActor(query.academyId, authority);
    if (!actor) return { ok: false, status: 403 };
    db = actor.db;
  } else {
    db = await signedIn(authority);
    if (!db) return { ok: false, status: 401 };
  }
  try {
    const { data, error } = await db.rpc("list_past_sessions", {
      p_academy_id: query.academyId ?? null,
      p_search: query.search?.trim() || null,
      p_from: query.from ?? null,
      p_to: query.to ?? null,
      p_before_started_at: cursor?.startedAt ?? null,
      p_before_id: cursor?.id ?? null,
      p_limit: limit + 1,
      p_archive: query.archive ?? "active",
    } as unknown as Database["public"]["Functions"]["list_past_sessions"]["Args"]);
    if (error) return { ok: false, status: 500 };
    const rows = z.array(pastRowSchema).parse(data);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      ok: true,
      data: {
        sessions: page.map((row) => ({
          ...toSummary(row), academyName: row.academy_name, academySlug: row.academy_slug, rosterCount: row.roster_count,
          endedAt: row.ended_at, endedByName: row.ended_by_name, endReason: row.end_reason,
          sessionArchivedAt: row.archived_at ?? null, sessionArchivedByName: row.archived_by_name ?? null,
        })),
        nextCursor: rows.length > limit && last ? encodeCursor({ startedAt: last.started_at, id: last.id }) : null,
      },
    };
  } catch {
    return { ok: false, status: 500 };
  }
}

/** One session with its historical roster, by tenant and stable id. */
export async function getSession(academyId: string, sessionId: string, authority?: Authority | null): Promise<ReadResult<SessionDetail>> {
  if (!z.uuid().safeParse(sessionId).success) return { ok: false, status: 400 };
  const actor = await sessionActor(academyId, authority);
  if (!actor) return { ok: false, status: 403 };
  try {
    const { data, error } = await actor.db.rpc("get_session", { p_academy_id: academyId, p_session_id: sessionId });
    if (error) return { ok: false, status: 500 };
    if (data === null) return { ok: false, status: 404 };
    const { session, roster, archive_events: events, archive_impact: impact } = detailSchema.parse(data);
    const archived = Boolean(session.archived_at);
    const yearOpen = session.year_open ?? false;
    const manage = (session.can_manage_archive ?? false) && yearOpen;
    return {
      ok: true,
      data: {
        ...toSummary(session),
        endedAt: session.ended_at,
        endedBy: session.ended_by,
        endedByName: session.ended_by_name,
        endReason: session.end_reason,
        sessionArchivedAt: session.archived_at ?? null,
        sessionArchivedByName: session.archived_by_name ?? null,
        archiveNote: session.archive_note ?? null,
        archiveEvents: (events ?? []).map((event) => ({
          action: event.action, endedLive: event.ended_live, note: event.note, actorName: event.actor_name, occurredAt: event.occurred_at,
        })),
        archiveImpact: impact ? {
          rosterCount: impact.roster_count, officialCount: impact.official_count, draftCount: impact.draft_count, pendingEffects: impact.pending_effects,
        } : null,
        yearOpen,
        permittedActions: { archive: manage && !archived, restore: manage && archived },
        roster: roster.map((row) => ({
          annualStudentRecordId: row.annual_student_record_id,
          academyStudentProfileId: row.academy_student_profile_id,
          fullName: row.full_name,
          studentPhone: row.student_phone,
          parentPhone: row.parent_phone,
          archived: row.archived,
          origin: row.origin,
          levelId: row.level_id,
          levelName: row.level_name,
          trackId: row.track_id,
          trackName: row.track_name,
          primaryGroupId: row.primary_group_id,
          groupName: row.group_name,
          participationType: row.participation_type,
        })),
      },
    };
  } catch {
    return { ok: false, status: 500 };
  }
}
