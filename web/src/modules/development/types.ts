/** Safe display state of Developer mode; never contains tokens, credentials or contacts. */
export type PreviewRole = "owner" | "head_admin" | "admin" | "instructor" | "student";

export type PreviewIdentity = {
  kind: "original" | "staff" | "student";
  /** Registry logical ID of a generated account; null for the real developer. */
  logicalId: string | null;
  displayName: string;
  role: PreviewRole;
};

export type PreviewStaffTarget = { logicalId: string; displayName: string; role: Exclude<PreviewRole, "student"> };
export type PreviewStudentTarget = { logicalId: string; displayName: string; recordId: string };

export type PreviewStatus =
  | { available: false }
  | { available: true; active: false; run: { id: string; academySlug: string } | null; students: PreviewStudentTarget[] }
  | {
    available: true;
    active: true;
    run: { id: string; academySlug: string };
    revision: number;
    expiresAt: string;
    current: PreviewIdentity;
    /** The staff identity Return to staff restores while a student is current. */
    priorStaff: PreviewIdentity | null;
    staffTargets: PreviewStaffTarget[];
    students: PreviewStudentTarget[];
  };

export type PreviewErrorCode =
  | "unavailable" | "invalid_request" | "forbidden" | "not_allowed" | "run_unavailable" | "session_inactive" | "nested"
  | "inactive" | "conflict" | "stale" | "busy" | "session_mismatch" | "invalid_target" | "sign_in_failed"
  | "original_unavailable";

export type PreviewResult =
  | { ok: true; destination: string; revision?: number }
  | { ok: false; error: PreviewErrorCode; destination?: string };
