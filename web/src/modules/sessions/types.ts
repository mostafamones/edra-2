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
};

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

export type SessionDetail = SessionSummary & {
  endedAt: string | null;
  endedBy: string | null;
  endedByName: string | null;
  /** "auto" when the session closed itself; then there is no endedBy. */
  endReason: Enums["session_end_reason"] | null;
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
  | "session_live"
  | "session_published"
  | "unavailable";

export type SessionFailure = { ok: false; code: SessionErrorCode; message: string };

export type StartOutcome = "started" | "existing" | "replayed";
export type StartResult = { ok: true; sessionId: string; outcome: StartOutcome } | SessionFailure;
export type DeleteResult = { ok: true } | SessionFailure;
export type EndResult = { ok: true; outcome: "ended" | "already_ended" } | SessionFailure;

export type ReadResult<T> = { ok: true; data: T } | { ok: false; status: 400 | 401 | 403 | 404 | 500 };
