import type { ParticipationType } from "./validation";

/** One annual student record as listed in the staff table, with its placement labels. */
export type StudentRecordRow = {
  id: string;
  academyStudentProfileId: string;
  fullName: string;
  studentPhone: string;
  parentPhone: string;
  levelId: string;
  levelName: string;
  trackId: string | null;
  trackName: string | null;
  primaryGroupId: string | null;
  groupName: string | null;
  participationType: ParticipationType;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  /** Online account connection; `suspended` when connected but archived or independently suspended. */
  onlineAccount: OnlineAccount;
  /** Manual (staff) suspension of the academy profile, across its annual records; independent of archival and connection. */
  manuallySuspended: boolean;
  /** The profile's suspension revision, separate from the record version; expected by suspension changes. */
  suspensionRevision: number;
  /** The linked account's own name (display name, else full name); null when no account is linked. */
  accountName: string | null;
  /** The annual record's staff-only labels, resolved from the academy's students catalog for display. */
  labelIds: string[];
};

export type OnlineAccount = "not_connected" | "connected" | "suspended";

/** The latest manual suspension change of a profile, for staff only. */
export type SuspensionChange = {
  action: "suspended" | "restored";
  reason: string | null;
  at: string;
  /** Null once the acting account was deleted. */
  actorName: string | null;
};

/** One record as loaded fresh for the edit sheet. */
export type StudentRecord = Omit<StudentRecordRow, "levelName" | "trackName" | "groupName" | "accountName"> & {
  academyId: string;
  academicYearId: string;
  /** Null when the profile has no recorded change, including suspensions that predate the audit. */
  latestSuspensionChange: SuspensionChange | null;
};

/** One selected record with its profile's fresh suspension state, for confirmation. */
export type SuspensionPreviewRow = {
  recordId: string;
  profileId: string;
  fullName: string;
  archived: boolean;
  yearClosed: boolean;
  connected: boolean;
  suspended: boolean;
  revision: number;
};

export type SuspensionOutcome = {
  changed: { recordId: string; profileId: string; revision: number }[];
  unchanged: { recordId: string; profileId: string; revision: number }[];
};

export type StudentListResult = {
  /** The open academic year the rows belong to; null when the academy has none. */
  academicYearId: string | null;
  rows: StudentRecordRow[];
  /** Records matching the search and filters. */
  total: number;
  /** Every record in the year, active and archived, regardless of filters. */
  yearTotal: number;
  pageIndex: number;
  pageSize: number;
};

export type StudentRecordErrorCode =
  | "validation"
  | "forbidden"
  | "duplicate_student_phone"
  | "invalid_placement"
  | "stale_record"
  | "archived_record"
  | "year_unavailable"
  | "not_found"
  | "unavailable"
  // Bulk group changes.
  | "incompatible_selection"
  // Imports.
  | "import_state"
  | "stale_revision"
  | "stage_conflict"
  | "incomplete_staging"
  | "outcome_changed"
  // Online-access suspension.
  | "stale_suspension";

export type StudentRecordField =
  | "fullName" | "studentPhone" | "parentPhone" | "levelId" | "trackId" | "primaryGroupId" | "participationType";

export type StudentRecordFailure = {
  ok: false;
  code: StudentRecordErrorCode;
  message: string;
  fieldErrors?: Partial<Record<StudentRecordField, string>>;
};

export type StudentRecordResult<T> = { ok: true; data: T } | StudentRecordFailure;

/** Identifies a record at the version the caller last saw, for stale-write detection. */
export type RecordVersion = { id: string; version: number };

/** Why a selected record cannot take part in a bulk group change. */
export type GroupChangeProblem = "missing" | "stale" | "archived" | "incompatible";

/** One selected record, fetched fresh, with its current and proposed group. */
export type GroupChangeRow = {
  id: string;
  /** Null when the record no longer exists in this academy and year. */
  fullName: string | null;
  levelId: string | null;
  levelName: string | null;
  trackId: string | null;
  trackName: string | null;
  currentGroupId: string | null;
  currentGroupName: string | null;
  /** The version now stored; differs from the selection's version when the record changed. */
  version: number | null;
  archived: boolean;
  problem: GroupChangeProblem | null;
  /** Whether the destination differs from the current group. */
  changes: boolean;
};

export type GroupChangePreview = {
  /** The chosen destination: a group, null for Unassigned, or undefined when none is chosen yet. */
  destination: { id: string; name: string; levelName: string; trackName: string | null } | null | undefined;
  rows: GroupChangeRow[];
  changed: number;
  unchanged: number;
  problems: Record<GroupChangeProblem, number>;
  /**
   * The selection's single level, or null when it spans several levels. `trackId` is the shared
   * track, or null when the students have different tracks (or none): only level-wide groups fit.
   */
  program: { levelId: string; trackId: string | null } | null;
};
