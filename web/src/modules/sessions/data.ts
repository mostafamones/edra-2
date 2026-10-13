import "server-only";

import { z } from "zod";

import { cookieAuthority, type Authority, type Db } from "@/lib/supabase/authority";
import type { Database } from "@/lib/supabase/database.types";
import { decodeCursor, DEFAULT_PAGE_SIZE, encodeCursor, MAX_PAGE_SIZE } from "./cursor";
import type { LiveSessionPage, PastSessionPage, ReadResult, SessionDetail } from "./types";

/**
 * Server-only session reads. Every read runs through the caller's Supabase session, so RLS limits
 * it to academies the caller belongs to; academy-scoped reads also verify membership first. Pass an
 * `authority` for token-authenticated API requests; it defaults to the request's cookie session.
 */

type Enums = Database["public"]["Enums"];
type ListArgs = Database["public"]["Functions"]["list_live_sessions"]["Args"];

/** The caller's client and role in the academy, or null when they are not a member. */
export async function sessionActor(academyId: string, authority?: Authority | null) {
  if (!z.uuid().safeParse(academyId).success) return null;
  const caller = authority ?? await cookieAuthority();
  if (!caller) return null;
  const { data } = await caller.db.from("academy_memberships").select("role")
    .eq("academy_id", academyId).eq("user_id", caller.userId).is("suspended_at", null).maybeSingle();
  return data ? { db: caller.db, userId: caller.userId, role: data.role } : null;
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
});
const rosterRowSchema = z.object({
  annual_student_record_id: z.string(),
  academy_student_profile_id: z.string(),
  full_name: z.string(),
  archived: z.boolean(),
  origin: enumOf<Enums["session_roster_origin"]>(["expected", "eligible"]),
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
  }),
  roster: z.array(rosterRowSchema),
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

/** `from` and `to` are inclusive academy-time days, "YYYY-MM-DD". */
export type SessionHistoryQuery = LiveSessionQuery & { search?: string | null; from?: string | null; to?: string | null };

/** Reads the live-list parameters plus `q` (search text, up to 100 characters) and `from`/`to` days. */
export function readSessionHistoryQuery(params: URLSearchParams): SessionHistoryQuery | null {
  const base = readLiveSessionQuery(params);
  const search = params.get("q");
  const from = params.get("from");
  const to = params.get("to");
  const isDay = (value: string | null) => value === null || z.iso.date().safeParse(value).success;
  if (!base || (search !== null && search.length > 100) || !isDay(from) || !isDay(to) || (from && to && from > to)) return null;
  return { ...base, search, from, to };
}

/** Ended and auto-closed sessions, newest first, optionally searched, with keyset pagination. */
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
    const { session, roster } = detailSchema.parse(data);
    return {
      ok: true,
      data: {
        ...toSummary(session),
        endedAt: session.ended_at,
        endedBy: session.ended_by,
        endedByName: session.ended_by_name,
        endReason: session.end_reason,
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
