import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];

export type AttendanceStatus = Enums["attendance_status"];
export type AttendanceSource = Enums["attendance_source"];

export const ATTENDANCE_STATUSES = ["unknown", "present", "late", "absent", "excused"] as const satisfies readonly AttendanceStatus[];

/** One roster student's draft and latest official attendance. Unknown at version 0 when unrecorded. */
export type AttendanceEntry = {
  annualStudentRecordId: string;
  fullName: string;
  /** The student's current code while the academy has student codes enabled, else null. */
  studentCode: string | null;
  /** The annual record is archived now; the roster entry is kept as history. */
  archived: boolean;
  origin: Enums["session_roster_origin"];
  groupName: string | null;
  status: AttendanceStatus;
  /** Pass back as `expectedVersion` when changing this entry. */
  version: number;
  source: AttendanceSource | null;
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
  /** Server time of the first positive check-in. */
  checkedInAt: string | null;
  /** Latest official value; null until a publication includes this student. */
  publishedStatus: AttendanceStatus | null;
  publishedAt: string | null;
};

export type SheetEntry = AttendanceEntry & {
  /** Attendance was published and this draft differs from the official value. */
  correctionPending: boolean;
};

/** unpublished: never published. published: drafts match official values. pending_corrections: republish needed. */
export type PublicationState = "unpublished" | "published" | "pending_corrections";

export type AttendanceSheet = {
  session: {
    id: string;
    academyId: string;
    academicYearId: string;
    scheduleTitle: string;
    groupName: string | null;
    mandatory: boolean;
    location: string | null;
    startedAt: string;
    autoEndAt: string;
    /** An expired live session is reported as ended. */
    state: Enums["session_state"];
    endedAt: string | null;
    yearOpen: boolean;
    /**
     * When the session itself was archived (not a student's `archived`): read-only and excluded from
     * counted attendance, including finalized values. Null when not archived.
     */
    archivedAt: string | null;
    metadataVersion: number;
  };
  /** The academy has student codes enabled, so entries may carry `studentCode`. */
  studentCodesEnabled: boolean;
  /** Monotonic attendance revision; pass it back when publishing. */
  revision: number;
  publishedRevision: number | null;
  publicationCount: number;
  lastPublishedAt: string | null;
  lastPublishedByName: string | null;
  publication: PublicationState;
  counts: Record<AttendanceStatus, number> & { total: number };
  permittedActions: { checkIn: boolean; edit: boolean; publish: boolean };
  entries: SheetEntry[];
};

export type AttendanceErrorCode =
  | "validation"
  | "forbidden"
  | "not_found"
  | "student_not_found"
  | "not_on_roster"
  | "student_codes_disabled"
  | "student_code_retired"
  | "student_code_not_found"
  | "student_code_ambiguous"
  | "session_ended"
  | "session_archived"
  | "year_unavailable"
  | "publication_stale"
  | "idempotency_conflict"
  | "throttled"
  | "unavailable";

export type AttendanceFailure = { ok: false; code: AttendanceErrorCode; message: string; retryAfter?: number };

export type CheckInOutcome = "recorded" | "already_recorded" | "review_required";
export type CheckInResult =
  | { ok: true; outcome: CheckInOutcome; entry: AttendanceEntry; revision: number; correctionPending: boolean; replayed: boolean }
  | AttendanceFailure;

export type AttendanceChange = { annualStudentRecordId: string; status: AttendanceStatus; expectedVersion: number };
export type ChangeResult =
  | { ok: true; outcome: "updated"; changed: number; entries: AttendanceEntry[]; revision: number; replayed: boolean }
  /** Nothing was applied: these entries changed since the versions you sent. */
  | { ok: true; outcome: "conflict"; conflicts: AttendanceEntry[]; revision: number }
  | AttendanceFailure;

export type PublishOutcome = "published" | "unchanged" | "already_published";
export type PublishResult =
  | { ok: true; outcome: PublishOutcome; publicationId: string | null; revision: number; itemCount: number; replayed: boolean }
  | AttendanceFailure;

export type ReadResult<T> = { ok: true; data: T } | { ok: false; status: 400 | 401 | 403 | 404 | 500 };
