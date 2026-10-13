import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];

export type SessionState = Enums["session_state"];
export type RosterOrigin = Enums["session_roster_origin"];

/** Schedule snapshot and lifecycle shared by list rows and session details. */
type SessionSummary = {
  id: string;
  academyId: string;
  academicYearId: string;
  scheduleId: string;
  scheduleTitle: string;
  scheduleKind: Enums["schedule_kind"];
  audience: Enums["schedule_audience"];
  groupId: string | null;
  groupName: string | null;
  levelId: string;
  levelName: string | null;
  trackId: string | null;
  trackName: string | null;
  mandatory: boolean;
  location: string | null;
  state: SessionState;
  /** Server-authoritative ISO timestamp. */
  startedAt: string;
  startedBy: string;
  startedByName: string | null;
  /** When the session closes itself if nobody ends it first. */
  autoEndAt: string;
  metadataVersion: number;
};

export type LiveSession = SessionSummary & {
  academyName: string;
  academySlug: string;
  rosterCount: number;
};

export type PastSession = Omit<LiveSession, "autoEndAt"> & {
  autoEndAt: string;
  endedAt: string;
  endedByName: string | null;
  endReason: Enums["session_end_reason"];
  /** When the session was archived (excluded from counted attendance); null when it is not archived. */
  sessionArchivedAt: string | null;
  sessionArchivedByName: string | null;
};

/** History filter: unarchived sessions (the default), archived sessions only, or both. */
export type HistoryArchiveFilter = "active" | "archived" | "all";
export const HISTORY_ARCHIVE_FILTERS = ["active", "archived", "all"] as const satisfies readonly HistoryArchiveFilter[];

export type PastSessionPage = {
  sessions: PastSession[];
  nextCursor: string | null;
};

export type LiveSessionPage = {
  sessions: LiveSession[];
  /** Pass back as `cursor` for the next page; null on the last page. */
  nextCursor: string | null;
};

export type RosterEntry = {
  annualStudentRecordId: string;
  academyStudentProfileId: string;
  fullName: string;
  /** The student's annual record is archived now; the roster entry is kept as history. */
  studentPhone: string;
  parentPhone: string;
  archived: boolean;
  origin: RosterOrigin;
  levelId: string;
  levelName: string | null;
  trackId: string | null;
  trackName: string | null;
  primaryGroupId: string | null;
  groupName: string | null;
  participationType: Enums["student_participation_type"];
};

/** One archive or restore of a session, oldest first. */
export type SessionArchiveEvent = {
  action: "archived" | "restored";
  /** Archiving ended the session while it was live. */
  endedLive: boolean;
  note: string | null;
  actorName: string | null;
  occurredAt: string;
};

export type SessionDetail = SessionSummary & {
  endedAt: string | null;
  endedBy: string | null;
  endedByName: string | null;
  /** "auto" when the session closed itself; then there is no endedBy. */
  endReason: Enums["session_end_reason"] | null;
  /**
   * Session archival (distinct from a roster entry's `archived`, which is about the student record).
   * An archived session is ended, read-only, and excluded from counted attendance.
   */
  sessionArchivedAt: string | null;
  sessionArchivedByName: string | null;
  archiveNote: string | null;
  archiveEvents: SessionArchiveEvent[];
  /**
   * What archiving affects, from trusted data: roster size, students with finalized values, students
   * with unfinalized changes, and outbox effects not yet processed (null when unavailable).
   */
  archiveImpact: { rosterCount: number; officialCount: number; draftCount: number; pendingEffects: number } | null;
  yearOpen: boolean;
  /** What the caller may do now; archive/restore need a manager role and an open year. */
  permittedActions: { archive: boolean; restore: boolean };
  roster: RosterEntry[];
};

export type SessionErrorCode =
  | "validation"
  | "forbidden"
  | "not_found"
  | "schedule_unavailable"
  | "year_unavailable"
  | "idempotency_conflict"
  | "session_ended"
  | "unavailable";

export type SessionFailure = { ok: false; code: SessionErrorCode; message: string };

export type StartOutcome = "started" | "existing" | "replayed";
/** `archived` is set for a replayed start whose original session has been archived since. */
export type StartResult = { ok: true; sessionId: string; outcome: StartOutcome; archived?: boolean } | SessionFailure;
export type EndResult = { ok: true; outcome: "ended" | "already_ended" } | SessionFailure;

/** The session's archive-relevant state after an archive/restore command. */
export type SessionArchiveState = {
  id: string;
  metadataVersion: number;
  state: SessionState;
  endedAt: string | null;
  endReason: Enums["session_end_reason"] | null;
  sessionArchivedAt: string | null;
  sessionArchivedByName: string | null;
  archiveNote: string | null;
};
/**
 * archived/restored: a transition. already_archived/not_archived: nothing to do. conflict: the
 * session changed since `expectedVersion`; nothing changed. `replayed` marks a retried request.
 */
export type ArchiveOutcome = "archived" | "already_archived" | "restored" | "not_archived" | "conflict";
export type ArchiveResult =
  | { ok: true; outcome: ArchiveOutcome; session: SessionArchiveState; endedLive: boolean; stoppedEffects: number; replayed: boolean }
  | SessionFailure;

export type ReadResult<T> = { ok: true; data: T } | { ok: false; status: 400 | 401 | 403 | 404 | 500 };
