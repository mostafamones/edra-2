import type { AttendanceSheet } from "./types";

// Prefixed by ["attendance", academyId] so switching academies can drop one academy's attendance.
export const attendanceRootKey = (academyId: string) => ["attendance", academyId] as const;
export const attendanceQueryKey = (academyId: string, sessionId: string) => [...attendanceRootKey(academyId), sessionId] as const;

export class AttendanceRequestError extends Error {
  constructor(readonly status: number) {
    super(`Attendance request failed with status ${status}`);
  }
}

/** A session's attendance sheet from the authenticated endpoint. */
export async function fetchAttendance(academyId: string, sessionId: string, signal?: AbortSignal): Promise<AttendanceSheet> {
  const query = new URLSearchParams({ academy: academyId });
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/attendance?${query}`, {
    signal, cache: "no-store", headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new AttendanceRequestError(response.status);
  return response.json() as Promise<AttendanceSheet>;
}
